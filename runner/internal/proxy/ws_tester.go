package proxy

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"proxy-stability-test/runner/internal/domain"
)

// WSTester performs WebSocket testing through a proxy
type WSTester struct {
	proxy        domain.ProxyConfig
	runID        string
	messagesPerMin int
	timeout      time.Duration
	wsURL        string   // ws://target:3001/ws-echo
	wssURL       string   // wss://target:3443/ws-echo
	samples      chan<- domain.WSSample
	logger       *slog.Logger
	seq          int
	mu           sync.Mutex
}

// NewWSTester creates a new WebSocket tester
func NewWSTester(proxy domain.ProxyConfig, runID string, messagesPerMin int, timeoutMS int,
	httpBaseURL, httpsBaseURL string, samples chan<- domain.WSSample, logger *slog.Logger) *WSTester {

	timeout := time.Duration(timeoutMS) * time.Millisecond

	wsURL := toWSURL(httpBaseURL, false) + "/ws-echo"
	wssURL := toWSURL(httpsBaseURL, true) + "/ws-echo"

	if messagesPerMin <= 0 {
		messagesPerMin = 60
	}

	testerLogger := logger.With(
		"module", "proxy.ws_tester",
		"goroutine", "ws",
		"run_id", runID,
		"proxy_label", proxy.Label,
	)

	testerLogger.Info("WS transport created",
		"phase", "continuous",
		"ws_messages_per_min", messagesPerMin,
		"ws_url", wsURL,
		"wss_url", wssURL,
	)

	return &WSTester{
		proxy:          proxy,
		runID:          runID,
		messagesPerMin: messagesPerMin,
		timeout:        timeout,
		wsURL:          wsURL,
		wssURL:         wssURL,
		samples:        samples,
		logger:         testerLogger,
	}
}

// Run starts the WS test loop, alternating ws/wss connections
func (t *WSTester) Run(ctx context.Context) error {
	t.logger.Info("WS goroutine started",
		"phase", "continuous",
		"ws_messages_per_min", t.messagesPerMin,
	)

	connNum := 0
	for {
		select {
		case <-ctx.Done():
			t.logger.Info("WS goroutine stopped",
				"phase", "stopping",
				"total_connections", connNum,
			)
			return nil
		default:
		}

		connNum++
		isWSS := connNum%2 == 0 // odd=ws, even=wss
		targetURL := t.wsURL
		if isWSS {
			targetURL = t.wssURL
		}

		sample := t.doConnection(ctx, targetURL, isWSS, connNum)

		select {
		case t.samples <- sample:
		case <-ctx.Done():
			return nil
		}

		// Brief pause between connections (reconnect delay)
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(2 * time.Second):
		}
	}
}

func (t *WSTester) doConnection(ctx context.Context, targetURL string, isWSS bool, connNum int) domain.WSSample {
	t.mu.Lock()
	t.seq++
	seq := t.seq
	t.mu.Unlock()

	sample := domain.WSSample{
		Seq:        seq,
		TargetURL:  targetURL,
		IsWSS:      isWSS,
		MeasuredAt: time.Now(),
	}

	protocol := "ws"
	if isWSS {
		protocol = "wss"
	}

	t.logger.Debug("WS connection start",
		"phase", "continuous",
		"protocol", protocol,
		"seq", seq,
		"connection_num", connNum,
	)

	connStart := time.Now()

	// Build proxy URL
	proxyURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("%s:%d", t.proxy.Host, t.proxy.Port),
	}
	if t.proxy.AuthUser != "" {
		proxyURL.User = url.UserPassword(t.proxy.AuthUser, t.proxy.AuthPass)
	}

	dialer := websocket.Dialer{
		Proxy: http.ProxyURL(proxyURL),
		NetDialContext: (&net.Dialer{
			Timeout:   t.timeout,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		HandshakeTimeout: t.timeout,
		TLSClientConfig:  &tls.Config{InsecureSkipVerify: true},
	}

	header := http.Header{}
	header.Set("User-Agent", "ProxyTester/1.0")
	header.Set("X-Run-Id", t.runID)
	header.Set("X-Seq", strconv.Itoa(seq))

	dialStart := time.Now()
	conn, resp, err := dialer.DialContext(ctx, targetURL, header)
	dialDuration := time.Since(dialStart)

	// Estimate TCP + handshake from total dial time
	sample.TCPConnectMS = float64(dialDuration.Microseconds()) / 1000.0 / 2
	sample.HandshakeMS = float64(dialDuration.Microseconds()) / 1000.0
	if isWSS {
		sample.TLSHandshakeMS = float64(dialDuration.Microseconds()) / 1000.0 / 3
	}

	if err != nil {
		sample.Connected = false
		sample.ErrorType = classifyWSError(err)
		sample.ErrorMessage = err.Error()
		sample.ConnectionHeldMS = float64(time.Since(connStart).Microseconds()) / 1000.0

		if resp != nil && resp.StatusCode != 101 {
			sample.DisconnectReason = fmt.Sprintf("HTTP %d", resp.StatusCode)
		} else {
			sample.DisconnectReason = "dial_failed"
		}

		t.logger.Warn("WS connection fail",
			"phase", "continuous",
			"protocol", protocol,
			"error_type", sample.ErrorType,
			"seq", seq,
		)
		return sample
	}
	defer conn.Close()

	sample.Connected = true

	t.logger.Debug("WS connected",
		"phase", "continuous",
		"protocol", protocol,
		"handshake_ms", sample.HandshakeMS,
		"seq", seq,
	)

	// Message loop: send messages at configured rate (1/sec for 60/min)
	messageInterval := time.Duration(float64(time.Minute) / float64(t.messagesPerMin))
	messageTicker := time.NewTicker(messageInterval)
	defer messageTicker.Stop()

	// Ping/pong monitoring
	pongCh := make(chan struct{}, 10)
	conn.SetPongHandler(func(appData string) error {
		select {
		case pongCh <- struct{}{}:
		default:
		}
		return nil
	})

	var totalRTT float64
	missedPongs := 0
	maxMessages := 60 // send up to 60 messages per connection

	// Ping ticker every 10s
	pingTicker := time.NewTicker(10 * time.Second)
	defer pingTicker.Stop()

	// Connection timeout: hold for ~60s then cleanly close
	holdTimer := time.NewTimer(60 * time.Second)
	defer holdTimer.Stop()

	// Read loop in separate goroutine
	readCh := make(chan readResult, maxMessages)
	doneCh := make(chan struct{})
	go func() {
		for {
			conn.SetReadDeadline(time.Now().Add(5 * time.Second))
			_, msg, err := conn.ReadMessage()
			select {
			case readCh <- readResult{msg: msg, err: err}:
			case <-doneCh:
				return
			}
			if err != nil {
				return
			}
		}
	}()

	msgNum := 0
	for msgNum < maxMessages {
		select {
		case <-ctx.Done():
			sample.DisconnectReason = "context_cancelled"
			goto done
		case <-holdTimer.C:
			sample.DisconnectReason = "hold_complete"
			goto done
		case <-pingTicker.C:
			if err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second)); err != nil {
				sample.DisconnectReason = "ping_write_error"
				goto done
			}
			// Wait briefly for pong
			select {
			case <-pongCh:
				missedPongs = 0
			case <-time.After(3 * time.Second):
				missedPongs++
				if missedPongs >= 3 {
					sample.DisconnectReason = "pong_timeout"
					t.logger.Warn("WS pong timeout (3 consecutive)",
						"phase", "continuous",
						"protocol", protocol,
						"seq", seq,
					)
					goto done
				}
			}
		case <-messageTicker.C:
			msgNum++
			payload := fmt.Sprintf(`{"seq":%d,"msg":%d,"ts":%d}`, seq, msgNum, time.Now().UnixMilli())

			sendStart := time.Now()
			if err := conn.WriteMessage(websocket.TextMessage, []byte(payload)); err != nil {
				sample.ErrorType = "write_error"
				sample.ErrorMessage = err.Error()
				sample.DisconnectReason = "write_error"
				goto done
			}
			sample.MessagesSent++

			// Wait for echo
			select {
			case result := <-readCh:
				if result.err != nil {
					if isTimeoutErr(result.err) {
						sample.DropCount++
					} else {
						sample.DisconnectReason = "read_error"
						goto done
					}
				} else {
					rtt := float64(time.Since(sendStart).Microseconds()) / 1000.0
					totalRTT += rtt
					sample.MessagesReceived++
					_ = result.msg // echo data
				}
			case <-time.After(5 * time.Second):
				sample.DropCount++
			case <-ctx.Done():
				sample.DisconnectReason = "context_cancelled"
				goto done
			}
		}
	}
	sample.DisconnectReason = "messages_complete"

done:
	close(doneCh)
	sample.ConnectionHeldMS = float64(time.Since(connStart).Microseconds()) / 1000.0

	if sample.MessagesReceived > 0 {
		sample.MessageRTTMS = totalRTT / float64(sample.MessagesReceived)
	}

	// Clean close
	conn.WriteMessage(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))

	t.logger.Info("WS connection complete",
		"phase", "continuous",
		"protocol", protocol,
		"seq", seq,
		"messages_sent", sample.MessagesSent,
		"messages_received", sample.MessagesReceived,
		"drops", sample.DropCount,
		"rtt_avg_ms", math.Round(sample.MessageRTTMS*100)/100,
		"held_ms", sample.ConnectionHeldMS,
		"disconnect", sample.DisconnectReason,
	)

	return sample
}

type readResult struct {
	msg []byte
	err error
}

func isTimeoutErr(err error) bool {
	if netErr, ok := err.(net.Error); ok {
		return netErr.Timeout()
	}
	return false
}

func classifyWSError(err error) string {
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
	case strings.Contains(errStr, "bad handshake"):
		return "ws_handshake_failed"
	default:
		return "unknown"
	}
}

// toWSURL converts an HTTP(S) URL to WS(S)
func toWSURL(httpURL string, secure bool) string {
	if secure {
		u := strings.Replace(httpURL, "https://", "wss://", 1)
		u = strings.Replace(u, "http://", "wss://", 1)
		return u
	}
	u := strings.Replace(httpURL, "http://", "ws://", 1)
	u = strings.Replace(u, "https://", "ws://", 1)
	return u
}
