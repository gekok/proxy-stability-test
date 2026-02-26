package proxy

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"proxy-stability-test/runner/internal/domain"
)

// HTTPSTester performs HTTPS testing through a CONNECT tunnel
type HTTPSTester struct {
	proxy      domain.ProxyConfig
	runID      string
	rpm        int
	timeout    time.Duration
	limiter    *rate.Limiter
	baseURL    string
	targetHost string
	targetPort int
	samples    chan<- domain.HTTPSample
	logger     *slog.Logger
	seq        int
}

// NewHTTPSTester creates a new HTTPS tester
func NewHTTPSTester(proxy domain.ProxyConfig, runID string, rpm int, timeoutMS int, baseURL string, samples chan<- domain.HTTPSample, logger *slog.Logger) *HTTPSTester {
	timeout := time.Duration(timeoutMS) * time.Millisecond

	ratePerSec := float64(rpm) / 60.0
	limiter := rate.NewLimiter(rate.Limit(ratePerSec), 1)

	// Parse target host:port from URL (e.g., https://target:3443)
	targetHost := "target"
	targetPort := 3443
	if strings.Contains(baseURL, "://") {
		parts := strings.SplitN(baseURL, "://", 2)
		hostPort := strings.Split(parts[1], "/")[0]
		if h, p, err := net.SplitHostPort(hostPort); err == nil {
			targetHost = h
			if pn, err := strconv.Atoi(p); err == nil {
				targetPort = pn
			}
		}
	}

	testerLogger := logger.With(
		"module", "proxy.https_tester",
		"goroutine", "https",
		"run_id", runID,
		"proxy_label", proxy.Label,
	)

	testerLogger.Info("HTTPS transport created",
		"phase", "continuous",
		"https_rpm", rpm,
		"proxy_host", proxy.Host,
		"proxy_port", proxy.Port,
		"target_host", targetHost,
		"target_port", targetPort,
	)

	return &HTTPSTester{
		proxy:      proxy,
		runID:      runID,
		rpm:        rpm,
		timeout:    timeout,
		limiter:    limiter,
		baseURL:    baseURL,
		targetHost: targetHost,
		targetPort: targetPort,
		samples:    samples,
		logger:     testerLogger,
	}
}

// Run starts the HTTPS test loop
func (t *HTTPSTester) Run(ctx context.Context) error {
	t.logger.Info("HTTPS goroutine started",
		"phase", "continuous",
		"https_rpm", t.rpm,
	)

	methodIdx := 0
	batchCount := 0
	lastIPCheck := time.Now()

	for {
		if err := t.limiter.Wait(ctx); err != nil {
			t.logger.Info("Cancel signal received",
				"phase", "stopping",
				"pending_requests", 0,
			)
			t.logger.Info("HTTPS goroutine stopped",
				"phase", "stopping",
				"total_samples", t.seq,
			)
			return nil
		}

		t.seq++
		mt := domain.MethodRotation[methodIdx]
		methodIdx = (methodIdx + 1) % len(domain.MethodRotation)

		var body []byte
		if mt.Body != nil {
			body = mt.Body(t.seq)
		}

		requestType := getRequestType(mt.Path)
		sample := t.doRequest(ctx, mt.Method, mt.Path, body, t.seq, requestType)
		select {
		case t.samples <- sample:
		default:
			t.logger.Warn("Sample channel near capacity",
				"phase", "continuous",
			)
			t.samples <- sample
		}

		// Every 10th batch: bandwidth + slow test
		if methodIdx == 0 {
			batchCount++
			t.logger.Debug("HTTPS method batch complete",
				"phase", "continuous",
				"batch_number", batchCount,
				"total_samples", t.seq,
			)

			if batchCount%10 == 0 {
				if err := t.limiter.Wait(ctx); err != nil {
					return nil
				}
				t.seq++
				largeSample := t.doRequest(ctx, "GET", "/large?size=1048576", nil, t.seq, "bandwidth")
				t.samples <- largeSample

				if err := t.limiter.Wait(ctx); err != nil {
					return nil
				}
				t.seq++
				slowSample := t.doRequest(ctx, "GET", "/slow?delay=2000", nil, t.seq, "timeout_test")
				t.samples <- slowSample
			}
		}

		// IP check every 30 seconds
		if time.Since(lastIPCheck) >= 30*time.Second {
			if err := t.limiter.Wait(ctx); err != nil {
				return nil
			}
			t.seq++
			ipSample := t.doRequest(ctx, "GET", "/ip", nil, t.seq, "ip_check")
			t.samples <- ipSample
			lastIPCheck = time.Now()
		}
	}
}

func (t *HTTPSTester) doRequest(ctx context.Context, method, path string, body []byte, seq int, requestType string) domain.HTTPSample {
	sample := domain.HTTPSample{
		Seq:        seq,
		TargetURL:  fmt.Sprintf("https://%s:%d%s", t.targetHost, t.targetPort, path),
		Method:     method,
		IsHTTPS:    true,
		MeasuredAt: time.Now(),
	}

	reqStart := time.Now()

	// Phase 1: TCP connect to proxy
	t.logger.Debug("HTTPS request start",
		"phase", "continuous",
		"request_type", requestType,
		"method", method,
		"seq", seq,
	)

	proxyAddr := fmt.Sprintf("%s:%d", t.proxy.Host, t.proxy.Port)
	dialer := net.Dialer{Timeout: t.timeout}
	conn, err := dialer.DialContext(ctx, "tcp", proxyAddr)
	if err != nil {
		sample.TCPConnectMS = float64(time.Since(reqStart).Milliseconds())
		sample.TotalMS = sample.TCPConnectMS
		sample.ErrorType = classifyHTTPError(err)
		sample.ErrorMessage = err.Error()
		t.logger.Debug("HTTPS request fail",
			"phase", "continuous",
			"request_type", requestType,
			"method", method,
			"error_type", sample.ErrorType,
			"stage", "tcp_connect",
			"seq", seq,
		)
		return sample
	}
	defer conn.Close()

	sample.TCPConnectMS = float64(time.Since(reqStart).Milliseconds())

	// Phase 1b: CONNECT tunnel
	connectReq := fmt.Sprintf("CONNECT %s:%d HTTP/1.1\r\nHost: %s:%d\r\n",
		t.targetHost, t.targetPort, t.targetHost, t.targetPort)
	if t.proxy.AuthUser != "" {
		auth := basicAuth(t.proxy.AuthUser, t.proxy.AuthPass)
		connectReq += fmt.Sprintf("Proxy-Authorization: Basic %s\r\n", auth)
	}
	connectReq += "\r\n"

	conn.SetDeadline(time.Now().Add(t.timeout))
	_, err = conn.Write([]byte(connectReq))
	if err != nil {
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		sample.ErrorType = "connect_tunnel_failed"
		sample.ErrorMessage = err.Error()
		t.logger.Debug("CONNECT tunnel fail",
			"phase", "continuous",
			"error_type", sample.ErrorType,
			"seq", seq,
		)
		return sample
	}

	reader := bufio.NewReader(conn)
	resp, err := http.ReadResponse(reader, nil)
	if err != nil {
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		sample.ErrorType = "connect_tunnel_failed"
		sample.ErrorMessage = err.Error()
		return sample
	}
	resp.Body.Close()

	if resp.StatusCode != 200 {
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		sample.ErrorType = classifyConnectError(resp.StatusCode)
		sample.ErrorMessage = fmt.Sprintf("CONNECT responded %d", resp.StatusCode)
		t.logger.Debug("CONNECT tunnel fail",
			"phase", "continuous",
			"error_type", sample.ErrorType,
			"status_code", resp.StatusCode,
			"seq", seq,
		)
		return sample
	}

	t.logger.Debug("CONNECT tunnel success",
		"phase", "continuous",
		"seq", seq,
	)

	// Phase 2: TLS handshake
	tlsStart := time.Now()
	tlsConn := tls.Client(conn, &tls.Config{
		ServerName:         t.targetHost,
		InsecureSkipVerify: true,
	})

	err = tlsConn.HandshakeContext(ctx)
	sample.TLSHandshakeMS = float64(time.Since(tlsStart).Milliseconds())

	if err != nil {
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		sample.ErrorType = classifyTLSError(err)
		sample.ErrorMessage = err.Error()
		t.logger.Debug("TLS handshake fail",
			"phase", "continuous",
			"error_type", sample.ErrorType,
			"tls_handshake_ms", sample.TLSHandshakeMS,
			"seq", seq,
		)
		return sample
	}

	state := tlsConn.ConnectionState()
	sample.TLSVersion = TLSVersionString(state.Version)
	sample.TLSCipher = tls.CipherSuiteName(state.CipherSuite)

	t.logger.Debug("TLS handshake success",
		"phase", "continuous",
		"tls_version", sample.TLSVersion,
		"tls_cipher", sample.TLSCipher,
		"tls_handshake_ms", sample.TLSHandshakeMS,
		"seq", seq,
	)

	// Phase 3: HTTPS request through tunnel
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
		sample.BytesSent = int64(len(body))
	}

	// Build raw HTTP request over TLS connection
	reqPath := path
	httpReq := fmt.Sprintf("%s %s HTTP/1.1\r\nHost: %s:%d\r\nUser-Agent: ProxyTester/1.0\r\nX-Run-Id: %s\r\nX-Seq: %d\r\nConnection: close\r\n",
		method, reqPath, t.targetHost, t.targetPort, t.runID, seq)

	if body != nil {
		httpReq += fmt.Sprintf("Content-Type: application/json\r\nContent-Length: %d\r\n", len(body))
	}
	httpReq += "\r\n"

	tlsConn.SetDeadline(time.Now().Add(t.timeout))
	_, err = tlsConn.Write([]byte(httpReq))
	if err != nil {
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		sample.ErrorType = "unknown"
		sample.ErrorMessage = err.Error()
		return sample
	}

	if bodyReader != nil {
		io.Copy(tlsConn, bodyReader)
	}

	ttfbStart := time.Now()
	tlsReader := bufio.NewReader(tlsConn)
	httpResp, err := http.ReadResponse(tlsReader, nil)
	if err != nil {
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		sample.TTFBMS = float64(time.Since(ttfbStart).Milliseconds())
		sample.ErrorType = "unknown"
		sample.ErrorMessage = err.Error()
		t.logger.Debug("HTTPS request fail",
			"phase", "continuous",
			"request_type", requestType,
			"method", method,
			"error_type", sample.ErrorType,
			"stage", "http_response",
			"seq", seq,
		)
		return sample
	}
	defer httpResp.Body.Close()

	sample.TTFBMS = float64(time.Since(ttfbStart).Milliseconds())
	sample.StatusCode = httpResp.StatusCode

	respBody, _ := io.ReadAll(httpResp.Body)
	sample.BytesReceived = int64(len(respBody))
	sample.TotalMS = float64(time.Since(reqStart).Milliseconds())

	t.logger.Debug("HTTPS total timing",
		"phase", "continuous",
		"request_type", requestType,
		"method", method,
		"tcp_connect_ms", sample.TCPConnectMS,
		"tls_handshake_ms", sample.TLSHandshakeMS,
		"ttfb_ms", sample.TTFBMS,
		"total_ms", sample.TotalMS,
		"status_code", sample.StatusCode,
		"seq", seq,
	)

	if sample.StatusCode >= 400 {
		t.logger.Warn("HTTPS non-200 status",
			"phase", "continuous",
			"request_type", requestType,
			"method", method,
			"status_code", sample.StatusCode,
			"seq", seq,
		)
	}

	return sample
}

func classifyTLSError(err error) string {
	errStr := err.Error()
	switch {
	case strings.Contains(errStr, "certificate has expired"):
		return "tls_cert_expired"
	case strings.Contains(errStr, "unknown authority"):
		return "tls_cert_untrusted"
	case strings.Contains(errStr, "hostname mismatch"):
		return "tls_hostname_mismatch"
	case strings.Contains(errStr, "protocol version"):
		return "tls_version_unsupported"
	default:
		return "tls_handshake_failed"
	}
}

func basicAuth(user, pass string) string {
	return base64.StdEncoding.EncodeToString([]byte(user + ":" + pass))
}
