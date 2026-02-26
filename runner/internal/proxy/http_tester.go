package proxy

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/time/rate"

	"proxy-stability-test/runner/internal/domain"
)

// HTTPTester performs plain HTTP testing through a proxy
type HTTPTester struct {
	proxy     domain.ProxyConfig
	runID     string
	rpm       int
	timeout   time.Duration
	limiter   *rate.Limiter
	baseURL   string
	samples   chan<- domain.HTTPSample
	logger    *slog.Logger
	client    *http.Client
	seq       int
}

// NewHTTPTester creates a new HTTP tester
func NewHTTPTester(proxy domain.ProxyConfig, runID string, rpm int, timeoutMS int, baseURL string, samples chan<- domain.HTTPSample, logger *slog.Logger) *HTTPTester {
	timeout := time.Duration(timeoutMS) * time.Millisecond

	proxyURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("%s:%d", proxy.Host, proxy.Port),
	}
	if proxy.AuthUser != "" {
		proxyURL.User = url.UserPassword(proxy.AuthUser, proxy.AuthPass)
	}

	transport := &http.Transport{
		Proxy: http.ProxyURL(proxyURL),
		DialContext: (&net.Dialer{
			Timeout:   timeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     90 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	ratePerSec := float64(rpm) / 60.0
	limiter := rate.NewLimiter(rate.Limit(ratePerSec), 1)

	testerLogger := logger.With(
		"module", "proxy.http_tester",
		"goroutine", "http",
		"run_id", runID,
		"proxy_label", proxy.Label,
	)

	testerLogger.Info("HTTP transport created",
		"phase", "continuous",
		"http_rpm", rpm,
		"proxy_host", proxy.Host,
		"proxy_port", proxy.Port,
	)

	return &HTTPTester{
		proxy:   proxy,
		runID:   runID,
		rpm:     rpm,
		timeout: timeout,
		limiter: limiter,
		baseURL: baseURL,
		samples: samples,
		logger:  testerLogger,
		client:  client,
	}
}

// Run starts the HTTP test loop until context is cancelled
func (t *HTTPTester) Run(ctx context.Context) error {
	t.logger.Info("HTTP goroutine started",
		"phase", "continuous",
		"http_rpm", t.rpm,
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
			t.logger.Info("HTTP goroutine stopped",
				"phase", "stopping",
				"total_samples", t.seq,
			)
			return nil
		}

		t.seq++
		mt := domain.MethodRotation[methodIdx]
		methodIdx = (methodIdx + 1) % len(domain.MethodRotation)

		targetURL := t.baseURL + mt.Path
		var body []byte
		if mt.Body != nil {
			body = mt.Body(t.seq)
		}

		requestType := getRequestType(mt.Path)

		sample := t.doRequest(ctx, mt.Method, targetURL, body, t.seq, requestType)
		select {
		case t.samples <- sample:
		default:
			t.logger.Warn("Sample channel near capacity",
				"phase", "continuous",
			)
			t.samples <- sample
		}

		// Every 10th cycle of full method rotation: add bandwidth + slow test
		if methodIdx == 0 {
			batchCount++
			t.logger.Debug("Method batch complete",
				"phase", "continuous",
				"batch_number", batchCount,
				"total_samples", t.seq,
			)

			if batchCount%10 == 0 {
				// Bandwidth test
				if err := t.limiter.Wait(ctx); err != nil {
					return nil
				}
				t.seq++
				largeSample := t.doRequest(ctx, "GET", t.baseURL+"/large?size=1048576", nil, t.seq, "bandwidth")
				t.samples <- largeSample

				// Slow test
				if err := t.limiter.Wait(ctx); err != nil {
					return nil
				}
				t.seq++
				slowSample := t.doRequest(ctx, "GET", t.baseURL+"/slow?delay=2000", nil, t.seq, "timeout_test")
				t.samples <- slowSample
			}
		}

		// IP check every 30 seconds
		if time.Since(lastIPCheck) >= 30*time.Second {
			if err := t.limiter.Wait(ctx); err != nil {
				return nil
			}
			t.seq++
			ipSample := t.doRequest(ctx, "GET", t.baseURL+"/ip", nil, t.seq, "ip_check")
			t.samples <- ipSample
			lastIPCheck = time.Now()

			t.logger.Info("IP stability check",
				"phase", "continuous",
				"request_type", "ip_check",
				"status_code", ipSample.StatusCode,
			)
		}
	}
}

// DoSingleRequest performs a single HTTP request (used for warmup)
func (t *HTTPTester) DoSingleRequest(ctx context.Context, method, path string, body []byte, seq int) domain.HTTPSample {
	targetURL := t.baseURL + path
	return t.doRequest(ctx, method, targetURL, body, seq, getRequestType(path))
}

func (t *HTTPTester) doRequest(ctx context.Context, method, targetURL string, body []byte, seq int, requestType string) domain.HTTPSample {
	sample := domain.HTTPSample{
		Seq:        seq,
		TargetURL:  targetURL,
		Method:     method,
		IsHTTPS:    false,
		MeasuredAt: time.Now(),
	}

	var connectStart, connectDone, gotFirstByte time.Time

	trace := &httptrace.ClientTrace{
		ConnectStart: func(_, _ string) { connectStart = time.Now() },
		ConnectDone: func(_, _ string, err error) {
			if err == nil {
				connectDone = time.Now()
			}
		},
		GotFirstResponseByte: func() { gotFirstByte = time.Now() },
	}

	reqStart := time.Now()

	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
		sample.BytesSent = int64(len(body))
	}

	req, err := http.NewRequestWithContext(httptrace.WithClientTrace(ctx, trace), method, targetURL, bodyReader)
	if err != nil {
		sample.ErrorType = "unknown"
		sample.ErrorMessage = err.Error()
		sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
		return sample
	}

	req.Header.Set("User-Agent", "ProxyTester/1.0")
	req.Header.Set("X-Run-Id", t.runID)
	req.Header.Set("X-Seq", strconv.Itoa(seq))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := t.client.Do(req)
	sample.TotalMS = float64(time.Since(reqStart).Milliseconds())

	if !connectStart.IsZero() && !connectDone.IsZero() {
		sample.TCPConnectMS = float64(connectDone.Sub(connectStart).Milliseconds())
	}
	if !gotFirstByte.IsZero() {
		sample.TTFBMS = float64(gotFirstByte.Sub(reqStart).Milliseconds())
	}

	if err != nil {
		sample.ErrorType = classifyHTTPError(err)
		sample.ErrorMessage = err.Error()

		t.logger.Debug("HTTP request fail",
			"phase", "continuous",
			"request_type", requestType,
			"method", method,
			"error_type", sample.ErrorType,
			"error_detail", sample.ErrorMessage,
			"total_ms", sample.TotalMS,
			"seq", seq,
		)
		return sample
	}
	defer resp.Body.Close()

	sample.StatusCode = resp.StatusCode

	// Read body to measure bytes received
	bodyBytes, _ := io.ReadAll(resp.Body)
	sample.BytesReceived = int64(len(bodyBytes))

	if resp.StatusCode >= 400 {
		t.logger.Warn("HTTP non-200 status",
			"phase", "continuous",
			"request_type", requestType,
			"method", method,
			"status_code", resp.StatusCode,
			"seq", seq,
		)
	}

	// Detect latency spikes (>2x the timeout threshold)
	if sample.TTFBMS > float64(t.timeout.Milliseconds())/2 {
		t.logger.Warn("HTTP latency spike",
			"phase", "continuous",
			"request_type", requestType,
			"method", method,
			"ttfb_ms", sample.TTFBMS,
			"total_ms", sample.TotalMS,
			"seq", seq,
		)
	}

	return sample
}

func classifyHTTPError(err error) string {
	errStr := err.Error()
	switch {
	case strings.Contains(errStr, "context deadline exceeded") || strings.Contains(errStr, "timeout"):
		return "timeout"
	case strings.Contains(errStr, "connection refused"):
		return "connection_refused"
	case strings.Contains(errStr, "connection reset"):
		return "connection_reset"
	case strings.Contains(errStr, "407") || strings.Contains(errStr, "Proxy Authentication Required"):
		return "proxy_auth_failed"
	case strings.Contains(errStr, "502") || strings.Contains(errStr, "503") || strings.Contains(errStr, "504"):
		return "proxy_error"
	default:
		return "unknown"
	}
}

func getRequestType(path string) string {
	switch {
	case strings.HasPrefix(path, "/echo"):
		return "echo"
	case strings.HasPrefix(path, "/large"):
		return "bandwidth"
	case strings.HasPrefix(path, "/slow"):
		return "timeout_test"
	case strings.HasPrefix(path, "/ip"):
		return "ip_check"
	default:
		return "unknown"
	}
}
