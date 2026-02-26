# Sprint 3 — WebSocket + IP Check + Parallel (Chi tiết)

> **Mục tiêu Sprint 3**: Nâng cấp toàn bộ pipeline — WS tester từ placeholder sang full implementation (ws/wss alternation, echo, ping/pong, reconnection), IP checker (DNSBL + GeoIP), scheduler multi-proxy (10 parallel), concurrency burst test, scoring 5 components, Dashboard hiển thị WS/IP data + score breakdown.

| Field | Value |
|-------|-------|
| Sprint | 3 / 4 |
| Thời gian | Week 5-6 |
| Input | Sprint 2 hoàn thành: Dashboard UI đầy đủ, CRUD forms, Start/Stop test, Realtime results, 49 log points |
| Output | Full pipeline: HTTP+HTTPS+WS+IP check, test song song 10 proxies, scoring đầy đủ 5 tiêu chí, Dashboard WS/IP/Score breakdown |

---

## Tổng quan Tasks (theo thứ tự dependency)

```
Task 1: Target Service — WS Echo Full Implementation
  ↓
Task 2: Go Runner — WS Tester (ws + wss, echo, ping/pong, reconnection)
Task 3: Go Runner — IP Checker (DNSBL + GeoIP)                ← Task 2+3 song song
  ↓
Task 4: Go Runner — Scheduler Upgrade (multi-proxy parallel)
  ↓
Task 5: Go Runner — Concurrency Burst Test
  ↓
Task 6: Go Runner — Scoring Upgrade (S_ws + S_security)
  ↓
Task 7: Controller API — WS/IP Endpoints Enhancement
  ↓
Task 8: Dashboard UI — WS/IP Display + Multi-proxy + Score Breakdown
  ↓
Task 9: Integration Test E2E
```

> Task 2 và Task 3 có thể làm song song vì không phụ thuộc nhau — chỉ phụ thuộc Task 1 (Target WS).
> Task 5 phụ thuộc Task 4 (scheduler cần multi-proxy trước khi burst).
> Task 8 phụ thuộc Task 7 (Dashboard cần API endpoints mới).

### Thay đổi so với Sprint 1/2 (upgrade, không tạo mới)

| Module | Sprint 1/2 Status | Sprint 3 Upgrade |
|--------|-------------------|------------------|
| Target `/ws-echo` | Placeholder (accept + echo 1 msg) | Full: echo mọi message, ping/pong, hold duration, close frame |
| Runner `ws_tester.go` | Placeholder goroutine (log only) | Full: ws/wss alternation, CONNECT tunnel, echo loop, reconnection |
| Runner `ipcheck/` | Chưa có code | Mới: blacklist.go + geoip.go |
| Runner `scheduler.go` | 1 proxy only | Max 10 parallel, semaphore, panic recovery |
| Runner `scorer.go` | 3 components (uptime, latency, jitter) | 5 components (+S_ws, +S_security) |
| API ws/ip endpoints | Tables exist, endpoints may be stubs | Full CRUD + batch + pagination |
| Dashboard | HTTP/HTTPS only | +WS metrics, +IP check, +score breakdown, +multi-proxy |

### Go Dependency mới

```
github.com/gorilla/websocket    # WebSocket client (deferred từ Sprint 1)
```

---

## Task 1: Target Service — WS Echo Full Implementation

### Mục tiêu
Upgrade `/ws-echo` placeholder thành full WebSocket echo server — echo mọi message JSON, ping/pong native, hold duration, close frame handling. Cả HTTP (:3001) và HTTPS (:3443) đều serve WS.

### Files cần sửa

```
target/
├── src/
│   └── ws/
│       └── wsEcho.ts              ← Rewrite từ placeholder sang full implementation
└── package.json                   ← Verify `ws` dependency đã có từ Sprint 1
```

### 1.1 WS Echo Spec chi tiết

**Echo behavior**:
- Nhận message JSON → echo nguyên vẹn về client
- Message format: `{ type, seq, connection_num, ts, run_id, payload }`
- Echo mọi message, không parse content — chỉ `ws.send(data.toString())`

**Ping/Pong**:
- Server gửi ping mỗi 10s (native WebSocket ping frame)
- Client auto respond pong (browser + gorilla/websocket đều auto)
- Server track pong response

**Hold duration**:
- Query param `?hold=60000` (default: no hold limit — kết nối mở vĩnh viễn nếu client không gửi `?hold=`)
- WS tester client luôn gửi `?hold=60000` khi kết nối
- Khi hết hold → server close connection với code 1000 (Normal Closure)
- Reason: `"hold duration reached"`

**Close frame handling**:
- Server gửi close frame code 1000
- Client close → server cleanup (clearTimeout, clearInterval)
- Error → server cleanup + log error

**HTTP + HTTPS**:
- `:3001/ws-echo` → WebSocket over HTTP (ws://)
- `:3443/ws-echo` → WebSocket over HTTPS (wss://)
- Same logic cho cả 2 — chỉ khác `protocol` field trong log

### 1.2 Code Example

```typescript
// target/src/ws/wsEcho.ts
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../logger';

const MODULE = 'ws.wsEcho';

export function setupEchoServer(wss: WebSocketServer, protocol: string, port: number) {
  wss.on('connection', (ws: WebSocket, req) => {
    const clientIP = req.socket.remoteAddress || 'unknown';
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let holdMs = 0; // default: no hold limit (client sends ?hold=60000)
    const holdParam = url.searchParams.get('hold');
    if (holdParam) holdMs = parseInt(holdParam, 10);
    let messagesCount = 0;
    const startTime = Date.now();

    // Log: WS connection opened
    logger.info({
      module: MODULE,
      client_ip: clientIP,
      protocol,
      server_port: port,
      hold_ms: holdMs,
    }, 'WS connection opened');

    // Hold duration timer
    const holdTimer = setTimeout(() => {
      logger.info({
        module: MODULE,
        client_ip: clientIP,
        hold_ms: holdMs,
        messages_count: messagesCount,
        protocol,
        server_port: port,
      }, 'WS hold duration reached');
      ws.close(1000, 'hold_duration_reached');
    }, holdMs);

    // Ping every 10s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 10000);

    // Echo messages
    ws.on('message', (data) => {
      messagesCount++;
      ws.send(data.toString());

      // Log: WS message echoed (DEBUG)
      logger.debug({
        module: MODULE,
        message_size: data.toString().length,
        client_ip: clientIP,
        protocol,
        server_port: port,
        messages_count: messagesCount,
      }, 'WS message echoed');
    });

    // Pong received
    ws.on('pong', () => {
      logger.debug({
        module: MODULE,
        client_ip: clientIP,
        protocol,
        server_port: port,
      }, 'WS pong received from client');
    });

    // Connection closed
    ws.on('close', (code, reason) => {
      clearTimeout(holdTimer);
      clearInterval(pingInterval);

      logger.info({
        module: MODULE,
        client_ip: clientIP,
        duration_ms: Date.now() - startTime,
        messages_count: messagesCount,
        close_code: code,
        close_reason: reason?.toString() || '',
        protocol,
        server_port: port,
      }, 'WS connection closed');
    });

    // Error
    ws.on('error', (err) => {
      clearTimeout(holdTimer);
      clearInterval(pingInterval);

      logger.error({
        module: MODULE,
        client_ip: clientIP,
        error_detail: err.message,
        protocol,
        server_port: port,
      }, 'WS error');
    });
  });
}
```

### 1.3 Logging (6 events — module `ws.wsEcho`)

| # | Event | Level | Fields |
|---|-------|-------|--------|
| 1 | WS connection opened | INFO | `client_ip`, `protocol` (ws/wss), `server_port`, `hold_ms` |
| 2 | WS message echoed | DEBUG | `message_size`, `client_ip`, `protocol`, `server_port`, `messages_count` |
| 3 | WS pong received from client | DEBUG | `client_ip`, `protocol`, `server_port` |
| 4 | WS hold duration reached | INFO | `client_ip`, `hold_ms`, `messages_count`, `protocol`, `server_port` |
| 5 | WS connection closed | INFO | `client_ip`, `duration_ms`, `messages_count`, `close_code`, `close_reason`, `protocol`, `server_port` |
| 6 | WS error | ERROR | `client_ip`, `error_detail`, `protocol`, `server_port` |

### Acceptance Criteria — Task 1
- [ ] `wscat -c ws://localhost:3001/ws-echo` → connection established
- [ ] Send JSON message → receive exact echo
- [ ] `?hold=5000` → server closes after 5s with code 1000
- [ ] Multiple messages echoed correctly (seq 1, 2, 3...)
- [ ] `wss://localhost:3443/ws-echo` → WSS works identically
- [ ] Logs show `protocol: "ws"` for :3001, `protocol: "wss"` for :3443

---

## Task 2: Go Runner — WS Tester Full Implementation

### Mục tiêu
Replace WS placeholder goroutine với full implementation — ws/wss alternation, CONNECT tunnel cho WSS, echo messages (60/phút), ping/pong (10s), drop detection, reconnection logic, connection lifecycle. Goroutine 3 chuyển từ "log only" sang fully active.

### Files tạo/sửa

```
runner/
├── internal/
│   ├── proxy/
│   │   └── ws_tester.go           ← New file (replace placeholder)
│   └── domain/
│       └── types.go               ← Thêm WSSample struct
└── go.mod                         ← Thêm github.com/gorilla/websocket
```

### 2.1 WSSample Struct

```go
// runner/internal/domain/types.go

// WSSample — 1 record per WS connection
type WSSample struct {
    Seq              int       `json:"seq"`               // connection number (1, 2, 3...)
    IsWarmup         bool      `json:"is_warmup"`         // always false for WS
    TargetURL        string    `json:"target_url"`        // ws:// or wss://
    Connected        bool      `json:"connected"`
    ErrorType        string    `json:"error_type"`        // ws_upgrade_failed, pong_timeout, error, timeout
    ErrorMessage     string    `json:"error_message"`
    TCPConnectMS     float64   `json:"tcp_connect_ms"`
    TLSHandshakeMS   float64   `json:"tls_handshake_ms"`  // wss only, 0 for ws
    HandshakeMS      float64   `json:"handshake_ms"`      // WS upgrade (101)
    MessageRTTMS     float64   `json:"message_rtt_ms"`    // avg RTT all messages in connection
    StartedAt        time.Time `json:"started_at"`
    ConnectionHeldMS float64   `json:"connection_held_ms"`
    DisconnectReason string    `json:"disconnect_reason"` // client_close, server_close, proxy_close, pong_timeout, error, timeout
    MessagesSent     int       `json:"messages_sent"`
    MessagesReceived int       `json:"messages_received"`
    DropCount        int       `json:"drop_count"`
    MeasuredAt       time.Time `json:"measured_at"`
}
```

### 2.2 WSTester — Main Loop (Connection Alternation)

```go
// runner/internal/proxy/ws_tester.go
package proxy

import (
    "context"
    "crypto/tls"
    "fmt"
    "log/slog"
    "net"
    "net/http"
    "net/url"
    "sync/atomic"
    "time"

    "github.com/gorilla/websocket"
)

type WSTester struct {
    proxy         ProxyConfig
    runID         string
    mpm           int     // messages per minute (default 60)
    holdDuration  time.Duration
    logger        *slog.Logger
    wsSamples     chan<- WSSample
    connectionNum int32
}

func NewWSTester(proxy ProxyConfig, runID string, mpm int, holdDuration time.Duration, logger *slog.Logger, wsSamples chan<- WSSample) *WSTester {
    return &WSTester{
        proxy:        proxy,
        runID:        runID,
        mpm:          mpm,
        holdDuration: holdDuration,
        logger:       logger,
        wsSamples:    wsSamples,
    }
}

func (t *WSTester) Run(ctx context.Context) error {
    t.logger.Info("WS goroutine started",
        "module", "proxy.ws_tester",
        "goroutine", "ws",
        "phase", "continuous",
        "proxy_label", t.proxy.Label,
        "run_id", t.runID,
        "mpm", t.mpm,
        "hold_duration_ms", t.holdDuration.Milliseconds(),
    )

    useWSS := false // alternate: false=ws, true=wss
    var totalConnections, wsConnections, wssConnections int
    var totalMessagesSent, totalDrops int

    defer func() {
        t.logger.Info("WS goroutine stopped",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "phase", "stopping",
            "total_connections", totalConnections,
            "ws_connections", wsConnections,
            "wss_connections", wssConnections,
            "total_messages_sent", totalMessagesSent,
            "total_drops", totalDrops,
            "running_for_ms", 0, // calculated from start time
        )
    }()

    for {
        select {
        case <-ctx.Done():
            connNum := atomic.LoadInt32(&t.connectionNum)
            t.logger.Info("Cancel signal received",
                "module", "proxy.ws_tester",
                "goroutine", "ws",
                "phase", "stopping",
                "proxy_label", t.proxy.Label,
                "connection_num", connNum,
            )
            return nil
        default:
        }

        atomic.AddInt32(&t.connectionNum, 1)
        connNum := atomic.LoadInt32(&t.connectionNum)
        totalConnections++

        // Select target URL based on alternation
        var targetURL string
        if useWSS {
            targetURL = fmt.Sprintf("wss://target:3443/ws-echo?hold=%d", t.holdDuration.Milliseconds())
            wssConnections++
        } else {
            targetURL = fmt.Sprintf("ws://target:3001/ws-echo?hold=%d", t.holdDuration.Milliseconds())
            wsConnections++
        }

        t.logger.Info("Connection start",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "phase", "continuous",
            "connection_num", connNum,
            "protocol", protocolStr(useWSS),
            "target_url", targetURL,
        )

        sample := t.runConnection(ctx, targetURL, useWSS, int(connNum))
        totalMessagesSent += sample.MessagesSent
        totalDrops += sample.DropCount

        // Send sample to channel
        select {
        case t.wsSamples <- sample:
        case <-ctx.Done():
            return nil
        }

        // Per-connection summary
        t.logger.Info("Per-connection summary",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "phase", "continuous",
            "connection_num", connNum,
            "protocol", protocolStr(useWSS),
            "handshake_ms", sample.HandshakeMS,
            "messages_sent", sample.MessagesSent,
            "messages_received", sample.MessagesReceived,
            "drop_count", sample.DropCount,
            "avg_rtt_ms", sample.MessageRTTMS,
            "connection_held_ms", sample.ConnectionHeldMS,
            "disconnect_reason", sample.DisconnectReason,
        )

        // Log reconnecting with next protocol info
        nextProtocol := protocolStr(!useWSS)
        t.logger.Info("WS reconnecting",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "connection_num", connNum+1,
            "previous_disconnect_reason", sample.DisconnectReason,
            "next_protocol", nextProtocol,
            "backoff_ms", 1000,
        )

        useWSS = !useWSS // alternate ws ↔ wss
        time.Sleep(1 * time.Second) // backoff_ms: 1000 = normal connection interval; 10*time.Second = retry exhaustion wait (different code paths, see reconnectWithRetry)
    }
}

func protocolStr(isWSS bool) string {
    if isWSS {
        return "wss"
    }
    return "ws"
}
```

### 2.3 runConnection — Per-connection Lifecycle

**WS path** (2 giai đoạn):
1. TCP connect qua proxy → WS upgrade (101) → message loop → close

**WSS path** (4 giai đoạn):
1. TCP connect qua proxy
2. CONNECT tunnel qua proxy
3. TLS handshake
4. WS upgrade (101) → message loop → close

```go
func (t *WSTester) runConnection(ctx context.Context, targetURL string, isWSS bool, connNum int) WSSample {
    sample := WSSample{
        Seq:       connNum,
        IsWarmup:  false,
        TargetURL: targetURL,
        StartedAt: time.Now(),
    }

    dialer := websocket.Dialer{
        HandshakeTimeout: 10 * time.Second,
    }

    if isWSS {
        // WSS: CONNECT tunnel + TLS
        t.logger.Debug("WSS CONNECT tunnel start",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "target_url", targetURL,
            "is_wss", true,
            "connection_num", connNum,
        )

        proxyURL, _ := url.Parse(fmt.Sprintf("http://%s:%d", t.proxy.Host, t.proxy.Port))
        dialer.Proxy = http.ProxyURL(proxyURL)
        dialer.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}

        connectStart := time.Now()
        // ... CONNECT tunnel logic ...
        connectDuration := time.Since(connectStart)

        t.logger.Debug("WSS CONNECT tunnel success",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "connect_tunnel_ms", connectDuration.Milliseconds(),
            "connection_num", connNum,
        )

        // TLS handshake
        tlsStart := time.Now()
        // ... TLS handshake ...
        tlsDuration := time.Since(tlsStart)
        sample.TLSHandshakeMS = float64(tlsDuration.Milliseconds())

        t.logger.Debug("WSS TLS handshake success",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "tls_handshake_ms", sample.TLSHandshakeMS,
            "tls_version", "TLS 1.2",
            "tls_cipher", "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
        )
    }

    // **Implementation note**: `gorilla/websocket` Dialer.DialContext() handles TCP → CONNECT → TLS → WS upgrade
    // internally as one call. To measure CONNECT and TLS separately, use a custom `net.Dialer` with
    // `DialContext` hook, or use `net.Dial` + manual HTTP CONNECT + `tls.Client()` + `websocket.NewClient()`.
    // Alternatively, measure total dial time and report combined CONNECT+TLS timing.

    // WS Upgrade
    t.logger.Debug("WS upgrade start",
        "module", "proxy.ws_tester",
        "goroutine", "ws",
        "target_url", targetURL,
        "is_wss", isWSS,
        "connection_num", connNum,
    )

    upgradeStart := time.Now()
    conn, _, err := dialer.DialContext(ctx, targetURL, nil)
    upgradeDuration := time.Since(upgradeStart)

    if err != nil {
        sample.Connected = false
        sample.ErrorType = "ws_upgrade_failed"
        sample.ErrorMessage = err.Error()
        sample.MeasuredAt = time.Now()

        t.logger.Error("WS upgrade fail",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "target_url", targetURL,
            "status_code", 0,
            "error_detail", err.Error(),
        )
        return sample
    }
    defer conn.Close()

    sample.Connected = true
    sample.HandshakeMS = float64(upgradeDuration.Milliseconds())

    t.logger.Info("WS upgrade success (101)",
        "module", "proxy.ws_tester",
        "goroutine", "ws",
        "target_url", targetURL,
        "handshake_ms", sample.HandshakeMS,
        "connection_num", connNum,
    )

    // Message loop + ping/pong
    sample = t.messageLoop(ctx, conn, sample, connNum)
    sample.ConnectionHeldMS = float64(time.Since(sample.StartedAt).Milliseconds())
    sample.MeasuredAt = time.Now()

    return sample
}
```

### 2.4 Message Loop (60 messages/phút = 1/giây)

```go
func (t *WSTester) messageLoop(ctx context.Context, conn *websocket.Conn, sample WSSample, connNum int) WSSample {
    ticker := time.NewTicker(time.Minute / time.Duration(t.mpm))
    defer ticker.Stop()

    var totalRTT float64
    var consecutivePongTimeouts int
    pingSeq := 0
    var lastPingSentAt time.Time

    // Set pong handler — track RTT from last ping
    conn.SetPongHandler(func(appData string) error {
        consecutivePongTimeouts = 0
        pongRTT := time.Since(lastPingSentAt)
        t.logger.Debug("Pong received",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "connection_num", connNum,
            "ping_seq", pingSeq,
            "pong_rtt_ms", pongRTT.Milliseconds(),
        )
        return nil
    })

    // Ping goroutine (every 10s)
    pingTicker := time.NewTicker(10 * time.Second)
    defer pingTicker.Stop()

    go func() {
        for range pingTicker.C {
            pingSeq++
            lastPingSentAt = time.Now()
            if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }
            t.logger.Debug("Ping sent",
                "module", "proxy.ws_tester",
                "goroutine", "ws",
                "connection_num", connNum,
                "ping_seq", pingSeq,
            )

            // Check pong timeout after 5s
            time.AfterFunc(5*time.Second, func() {
                consecutivePongTimeouts++
                if consecutivePongTimeouts >= 3 {
                    t.logger.Error("Pong 3x timeout → dead",
                        "module", "proxy.ws_tester",
                        "goroutine", "ws",
                        "connection_num", connNum,
                        "consecutive_timeouts", 3,
                    )
                    sample.DisconnectReason = "pong_timeout"
                    conn.Close()
                } else {
                    t.logger.Warn("Pong timeout",
                        "module", "proxy.ws_tester",
                        "goroutine", "ws",
                        "connection_num", connNum,
                        "ping_seq", pingSeq,
                        "consecutive_timeouts", consecutivePongTimeouts,
                    )
                }
            })
        }
    }()

    // Message loop
    for {
        select {
        case <-ctx.Done():
            t.logger.Debug("Closing active connection",
                "module", "proxy.ws_tester",
                "goroutine", "ws",
                "phase", "stopping",
                "connection_num", connNum,
                "protocol", sample.TargetURL,
                "connection_held_ms", time.Since(sample.StartedAt).Milliseconds(),
            )
            sample.DisconnectReason = "client_close"
            return sample

        case <-ticker.C:
            sample.MessagesSent++
            seq := sample.MessagesSent

            // Send echo message
            msg := fmt.Sprintf(`{"type":"echo","seq":%d,"connection_num":%d,"ts":"%s","run_id":"%s","payload":"test_%d"}`,
                seq, connNum, time.Now().Format(time.RFC3339Nano), t.runID, seq)

            sendStart := time.Now()
            if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
                sample.ErrorType = "error"
                sample.ErrorMessage = err.Error()
                sample.DisconnectReason = "error"
                return sample
            }

            t.logger.Debug("Message sent",
                "module", "proxy.ws_tester",
                "goroutine", "ws",
                "seq", seq,
                "message_size", len(msg),
                "connection_num", connNum,
            )

            // Wait for echo response (timeout 5s)
            conn.SetReadDeadline(time.Now().Add(5 * time.Second))
            _, response, err := conn.ReadMessage()
            rtt := time.Since(sendStart)

            if err != nil {
                sample.DropCount++
                t.logger.Warn("Message drop detected",
                    "module", "proxy.ws_tester",
                    "goroutine", "ws",
                    "seq", seq,
                    "messages_sent", sample.MessagesSent,
                    "messages_received", sample.MessagesReceived,
                    "drop_count", sample.DropCount,
                )
                continue
            }

            sample.MessagesReceived++
            totalRTT += float64(rtt.Milliseconds())
            sample.MessageRTTMS = totalRTT / float64(sample.MessagesReceived)
            _ = response // echo content verified if needed

            t.logger.Debug("Message RTT recorded",
                "module", "proxy.ws_tester",
                "goroutine", "ws",
                "seq", seq,
                "rtt_ms", rtt.Milliseconds(),
                "connection_num", connNum,
            )
        }
    }
}
```

### 2.5 Reconnection Logic

```go
func (t *WSTester) reconnectWithRetry(ctx context.Context, targetURL string, isWSS bool, connNum int) WSSample {
    maxRetries := 3
    backoffs := []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second}

    for attempt := 1; attempt <= maxRetries; attempt++ {
        select {
        case <-ctx.Done():
            return WSSample{DisconnectReason: "client_close"}
        default:
        }

        t.logger.Warn("WS connect retry",
            "module", "proxy.ws_tester",
            "goroutine", "ws",
            "connection_num", connNum,
            "retry_attempt", attempt,
            "backoff_ms", backoffs[attempt-1].Milliseconds(),
        )

        time.Sleep(backoffs[attempt-1])
        sample := t.runConnection(ctx, targetURL, isWSS, connNum)
        if sample.Connected {
            return sample
        }
    }

    t.logger.Error("WS connect retry exhausted",
        "module", "proxy.ws_tester",
        "goroutine", "ws",
        "connection_num", connNum,
        "total_attempts", 3,
        "wait_before_next", "10s",
    )

    // Wait 10s before trying again (goroutine never gives up)
    time.Sleep(10 * time.Second)
    return WSSample{Connected: false, ErrorType: "timeout", DisconnectReason: "timeout"}
}
```

**Reconnection flow**:
```
Connection close → wait 1s → alternate ws↔wss → new connection
Connect fail → retry 3x (1s → 2s → 4s backoff)
All retries exhausted → wait 10s → try again
Goroutine NEVER gives up — chỉ dừng khi ctx.Done() (user bấm Stop)
```

### 2.6 Connection Hold + Disconnect

```go
// Connection held successfully (hold duration reached → server closes)
t.logger.Info("Connection held",
    "module", "proxy.ws_tester",
    "goroutine", "ws",
    "connection_held_ms", connectionHeldMS,
    "disconnect_reason", "client_close",
    "protocol", protocolStr(isWSS),
)

// Unexpected disconnect (server/proxy closes before hold duration)
t.logger.Error("Unexpected disconnect",
    "module", "proxy.ws_tester",
    "goroutine", "ws",
    "connection_held_ms", connectionHeldMS,
    "disconnect_reason", reason,
    "error_detail", errMsg,
)
```

**Disconnect reasons**:

| Reason | Ý nghĩa |
|--------|---------|
| `client_close` | Client đóng khi hold hết hoặc ctx cancel |
| `server_close` | Server close frame (code 1000 khi hold hết) |
| `proxy_close` | Proxy đóng connection |
| `pong_timeout` | 3x consecutive pong timeout → dead |
| `error` | WS error event |
| `timeout` | Connection timeout |

### 2.7 Logging (26 events — module `proxy.ws_tester`, goroutine `ws`)

| # | Event | Level | Key Fields |
|---|-------|-------|------------|
| 1 | WS goroutine started | INFO | `proxy_label`, `run_id`, `mpm`, `hold_duration_ms` |
| 2 | Connection start | INFO | `connection_num`, `protocol` (ws/wss), `target_url` |
| 3 | WSS CONNECT tunnel start | DEBUG | `target_url`, `is_wss: true`, `connection_num` |
| 4 | WSS CONNECT tunnel success | DEBUG | `connect_tunnel_ms`, `connection_num` |
| 5 | WSS CONNECT tunnel fail | ERROR | `proxy_status`, `error_detail`, `connection_num` |
| 6 | WSS TLS handshake success | DEBUG | `tls_handshake_ms`, `tls_version`, `tls_cipher` |
| 7 | WSS TLS handshake fail | ERROR | `error_detail`, `tls_handshake_ms` |
| 8 | WS upgrade start | DEBUG | `target_url`, `is_wss`, `connection_num` |
| 9 | WS upgrade success (101) | INFO | `target_url`, `handshake_ms`, `connection_num` |
| 10 | WS upgrade fail | ERROR | `target_url`, `status_code`, `error_detail` |
| 11 | Message sent | DEBUG | `seq`, `message_size`, `connection_num` |
| 12 | Message RTT recorded | DEBUG | `seq`, `rtt_ms`, `connection_num` |
| 13 | Message drop detected | WARN | `seq`, `messages_sent`, `messages_received`, `drop_count` |
| 14 | Ping sent | DEBUG | `connection_num`, `ping_seq` |
| 15 | Pong received | DEBUG | `connection_num`, `ping_seq`, `pong_rtt_ms` |
| 16 | Pong timeout | WARN | `connection_num`, `ping_seq`, `consecutive_timeouts` |
| 17 | Pong 3x timeout → dead | ERROR | `connection_num`, `consecutive_timeouts: 3` |
| 18 | Connection held | INFO | `connection_held_ms`, `disconnect_reason`, `protocol` |
| 19 | Unexpected disconnect | ERROR | `connection_held_ms`, `disconnect_reason`, `error_detail` |
| 20 | Per-connection summary | INFO | `connection_num`, `protocol`, `handshake_ms`, `messages_sent`, `drop_count`, `avg_rtt_ms`, `connection_held_ms`, `disconnect_reason` |
| 21 | WS reconnecting | INFO | `connection_num` (next), `previous_disconnect_reason`, `next_protocol`, `backoff_ms` |
| 22 | WS connect retry | WARN | `connection_num`, `retry_attempt` (1-3), `backoff_ms` |
| 23 | WS connect retry exhausted | ERROR | `connection_num`, `total_attempts: 3`, `wait_before_next: 10s` |
| 24 | Cancel signal received | INFO | `proxy_label`, `connection_num`, `phase: "stopping"` |
| 25 | Closing active connection | DEBUG | `connection_num`, `protocol`, `connection_held_ms`, `phase: "stopping"` |
| 26 | WS goroutine stopped | INFO | `total_connections`, `ws_connections`, `wss_connections`, `total_messages_sent`, `total_drops`, `running_for_ms`, `phase: "stopping"` |

### Acceptance Criteria — Task 2
- [ ] WS goroutine connects ws://target:3001/ws-echo qua proxy
- [ ] WSS goroutine connects wss://target:3443/ws-echo qua CONNECT tunnel + TLS
- [ ] Alternation: connection 1=ws, 2=wss, 3=ws, 4=wss, ...
- [ ] Echo messages gửi/nhận đúng, RTT đo đúng
- [ ] Drop detection: message không nhận echo trong 5s → drop_count++
- [ ] Ping/pong hoạt động, 3x timeout → connection dead
- [ ] Hold duration hết → client close → disconnect_reason = "client_close"
- [ ] Reconnection: connect fail → retry 3x → wait 10s → retry again
- [ ] ws_sample records ghi đúng vào DB qua channel
- [ ] 26 log events đầy đủ, filter được theo `goroutine=ws`

---

## Task 3: Go Runner — IP Checker (DNSBL + GeoIP)

### Mục tiêu
Implement IP verification — DNSBL blacklist lookup + GeoIP country verification. Chạy ở Phase 1 (IP Verification) trong orchestrator. Mỗi 30s kiểm tra IP stability.

### Files tạo

```
runner/
└── internal/
    ├── ipcheck/
    │   ├── blacklist.go           ← DNSBL lookup (new)
    │   └── geoip.go               ← GeoIP verification (new)
    └── domain/
        └── types.go               ← Thêm IPCheckResult struct
```

### 3.1 IPCheckResult Struct

```go
// runner/internal/domain/types.go

type IPCheckResult struct {
    RunID             string    `json:"run_id"`
    ProxyID           string    `json:"proxy_id"`
    ObservedIP        string    `json:"observed_ip"`
    ExpectedCountry   string    `json:"expected_country"`
    ActualCountry     string    `json:"actual_country"`
    ActualRegion      string    `json:"actual_region"`
    ActualCity        string    `json:"actual_city"`
    GeoMatch          bool      `json:"geo_match"`
    BlacklistChecked  bool      `json:"blacklist_checked"`
    BlacklistsQueried int       `json:"blacklists_queried"`
    BlacklistsListed  int       `json:"blacklists_listed"`
    BlacklistSources  []string  `json:"blacklist_sources"`
    IsClean           bool      `json:"is_clean"`
    IPStable          bool      `json:"ip_stable"`
    IPChanges         int       `json:"ip_changes"`
    CheckedAt         time.Time `json:"checked_at"`
}
```

### 3.2 DNSBL Blacklist Check

```go
// runner/internal/ipcheck/blacklist.go
package ipcheck

import (
    "fmt"
    "log/slog"
    "net"
    "strings"
)

// 4 DNSBL servers
var DNSBLServers = []string{
    "zen.spamhaus.org",
    "b.barracudacentral.org",
    "bl.spamcop.net",
    "dnsbl.sorbs.net",
}

func CheckBlacklist(logger *slog.Logger, ip string) (queried, listed int, sources []string, err error) {
    logger.Info("Blacklist check start",
        "module", "ipcheck.blacklist",
        "observed_ip", ip,
        "dnsbl_count", len(DNSBLServers),
    )

    reversed := reverseIP(ip)

    for _, server := range DNSBLServers {
        lookup := fmt.Sprintf("%s.%s", reversed, server)
        _, lookupErr := net.LookupHost(lookup)
        queried++

        if lookupErr == nil {
            // DNS resolves → IP is listed on this blacklist
            listed++
            sources = append(sources, server)
            logger.Warn("IP listed (dirty)",
                "module", "ipcheck.blacklist",
                "observed_ip", ip,
                "blacklist_source", server,
                "blacklists_listed", listed,
            )
        } else if !isDNSNotFound(lookupErr) {
            // DNSBL query failed (not NXDOMAIN)
            logger.Warn("DNSBL query fail",
                "module", "ipcheck.blacklist",
                "dnsbl_server", server,
                "error_detail", lookupErr.Error(),
            )
        }
    }

    if listed == 0 {
        logger.Info("IP clean",
            "module", "ipcheck.blacklist",
            "observed_ip", ip,
            "blacklists_queried", queried,
        )
    }

    return queried, listed, sources, nil
}

// reverseIP reverses IP octets: 1.2.3.4 → 4.3.2.1
func reverseIP(ip string) string {
    parts := strings.Split(ip, ".")
    for i, j := 0, len(parts)-1; i < j; i, j = i+1, j-1 {
        parts[i], parts[j] = parts[j], parts[i]
    }
    return strings.Join(parts, ".")
}

func isDNSNotFound(err error) bool {
    if dnsErr, ok := err.(*net.DNSError); ok {
        return dnsErr.IsNotFound
    }
    return false
}
```

### 3.3 GeoIP Verification

```go
// runner/internal/ipcheck/geoip.go
package ipcheck

import (
    "encoding/json"
    "fmt"
    "log/slog"
    "net/http"
    "time"
)

type geoIPResponse struct {
    Status      string `json:"status"`
    Country     string `json:"country"`
    CountryCode string `json:"countryCode"`
    Region      string `json:"region"`
    City        string `json:"city"`
}

func CheckGeoIP(logger *slog.Logger, ip string) (country, countryCode, region, city string, err error) {
    apiURL := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,country,countryCode,region,city", ip)

    client := &http.Client{Timeout: 10 * time.Second}
    resp, err := client.Get(apiURL)
    if err != nil {
        logger.Error("Geo API fail",
            "module", "ipcheck.geoip",
            "api_url", apiURL,
            "error_detail", err.Error(),
        )
        return "", "", "", "", err
    }
    defer resp.Body.Close()

    var result geoIPResponse
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        logger.Error("Geo API fail",
            "module", "ipcheck.geoip",
            "api_url", apiURL,
            "error_detail", "JSON decode failed: " + err.Error(),
        )
        return "", "", "", "", err
    }

    logger.Info("Geo lookup done",
        "module", "ipcheck.geoip",
        "observed_ip", ip,
        "actual_country", result.CountryCode,
        "actual_city", result.City,
    )

    return result.Country, result.CountryCode, result.Region, result.City, nil
}

func CheckGeoMatch(logger *slog.Logger, expectedCountry, actualCountry, ip string) bool {
    match := expectedCountry == actualCountry
    if !match {
        logger.Warn("Geo mismatch",
            "module", "ipcheck.geoip",
            "expected_country", expectedCountry,
            "actual_country", actualCountry,
            "observed_ip", ip,
        )
    }
    return match
}
```

### 3.4 Integration vào Orchestrator — Phase 1

```go
// Trong orchestrator.go — Phase 1: IP Verification
// Chạy 1 lần khi bắt đầu test

// Step 1: Get observed IP qua proxy
observedIP := getIPViaProxy(proxy, "http://target:3001/ip")

// Step 2: Blacklist check
queried, listed, sources, err := ipcheck.CheckBlacklist(logger, observedIP)
isClean := listed == 0

// Step 3: GeoIP verification
country, countryCode, region, city, err := ipcheck.CheckGeoIP(logger, observedIP)
geoMatch := ipcheck.CheckGeoMatch(logger, proxy.ExpectedCountry, countryCode, observedIP)

// Step 4: Build result
ipCheckResult := domain.IPCheckResult{
    RunID:             runID,
    ProxyID:           proxy.ID,
    ObservedIP:        observedIP,
    ExpectedCountry:   proxy.ExpectedCountry,
    ActualCountry:     countryCode,
    ActualRegion:      region,
    ActualCity:        city,
    GeoMatch:          geoMatch,
    BlacklistChecked:  true,
    BlacklistsQueried: queried,
    BlacklistsListed:  listed,
    BlacklistSources:  sources,
    IsClean:           isClean,
    IPStable:          true,  // initial: stable
    IPChanges:         0,
    CheckedAt:         time.Now(),
}

// Step 5: Submit to reporter
reporter.SubmitIPCheck(ipCheckResult)
```

> **Lưu ý**: Orchestrator Phase 1 cũng sử dụng các IP check events đã có từ Sprint 1 (events #5-7 trong `proxy.http_tester`: "Observed IP", "IP match", "IP mismatch"). Các events này đã được logging, không cần thêm mới ở đây — chỉ cần gọi đúng `ipcheck.CheckBlacklist()` và `ipcheck.CheckGeoIP()` (events #1-7 trong bảng 3.6 dưới đây).

### 3.5 IP Stability Tracking (mỗi 30s)

```go
// HTTP goroutine đã có GET /ip mỗi 30s (Sprint 1)
// Sprint 3: so sánh observed IP với IP ban đầu

var initialIP string
var ipChanges int
var ipStable = true

// Trong HTTP goroutine, mỗi 30s:
currentIP := getIPViaProxy(proxy, "http://target:3001/ip")
if initialIP == "" {
    initialIP = currentIP
} else if currentIP != initialIP {
    ipChanges++
    ipStable = false
    logger.Warn("IP changed",
        "module", "proxy.http_tester",
        "goroutine", "http",
        "initial_ip", initialIP,
        "current_ip", currentIP,
        "ip_changes", ipChanges,
    )
}
```

### 3.6 Logging (8 events)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `ipcheck.blacklist` | Blacklist check start | INFO | `observed_ip`, `dnsbl_count` |
| 2 | `ipcheck.blacklist` | IP clean | INFO | `observed_ip`, `blacklists_queried` |
| 3 | `ipcheck.blacklist` | IP listed (dirty) | WARN | `observed_ip`, `blacklist_source`, `blacklists_listed` |
| 4 | `ipcheck.blacklist` | DNSBL query fail | WARN | `dnsbl_server`, `error_detail` |
| 5 | `ipcheck.geoip` | Geo lookup done | INFO | `observed_ip`, `actual_country`, `actual_city` |
| 6 | `ipcheck.geoip` | Geo mismatch | WARN | `expected_country`, `actual_country`, `observed_ip` |
| 7 | `ipcheck.geoip` | Geo API fail | ERROR | `api_url`, `error_detail` |
| 8 | `proxy.http_tester` | IP changed | WARN | `initial_ip`, `current_ip`, `ip_changes` |

### Acceptance Criteria — Task 3
- [ ] DNSBL lookup query đúng 4 servers
- [ ] IP clean → `is_clean: true`, `blacklists_listed: 0`
- [ ] GeoIP resolve country/region/city
- [ ] Geo mismatch → `geo_match: false`, log WARN
- [ ] `ip_check_result` record ghi đúng vào DB
- [ ] IP stability: IP thay đổi → `ip_changes++`
- [ ] Geo API down → ERROR log, test vẫn tiếp tục (không dừng)

---

## Task 4: Go Runner — Scheduler Upgrade (Multi-proxy Parallel)

### Mục tiêu
Upgrade scheduler từ 1 proxy → max 10 proxies chạy song song. Mỗi proxy có isolated context — 1 proxy fail không ảnh hưởng proxy khác. Panic recovery cho mỗi goroutine.

### Files cần sửa

```
runner/
└── internal/
    └── engine/
        └── scheduler.go           ← Upgrade
```

### 4.1 Scheduler RunAll (Multi-proxy)

```go
// runner/internal/engine/scheduler.go
package engine

import (
    "context"
    "fmt"
    "log/slog"
    "runtime/debug"
    "sync"
    "time"
)

type Scheduler struct {
    maxParallel int
    logger      *slog.Logger
}

func NewScheduler(maxParallel int, logger *slog.Logger) *Scheduler {
    if maxParallel <= 0 || maxParallel > 10 {
        maxParallel = 10
    }
    return &Scheduler{
        maxParallel: maxParallel,
        logger:      logger,
    }
}

func (s *Scheduler) RunAll(ctx context.Context, runs []RunConfig) error {
    startTime := time.Now()

    s.logger.Info("Scheduler start",
        "module", "engine.scheduler",
        "proxy_count", len(runs),
        "max_parallel", s.maxParallel,
    )

    sem := make(chan struct{}, s.maxParallel) // semaphore max 10
    var wg sync.WaitGroup
    var mu sync.Mutex
    var successCount, failCount int
    goroutineID := 0

    for _, run := range runs {
        sem <- struct{}{} // acquire slot
        wg.Add(1)
        goroutineID++
        gid := goroutineID

        go func(r RunConfig, id int) {
            defer wg.Done()
            defer func() { <-sem }() // release slot
            defer s.recoverPanic(r)  // panic recovery

            proxyStart := time.Now()

            s.logger.Info("Proxy goroutine start",
                "module", "engine.scheduler",
                "proxy_label", r.Proxy.Label,
                "goroutine_id", id,
            )

            childCtx, cancel := context.WithCancel(ctx)
            defer cancel()

            orchestrator := NewOrchestrator(r, s.logger)
            err := orchestrator.Run(childCtx)

            duration := time.Since(proxyStart)
            status := "success"
            if err != nil {
                status = "failed"
            }

            mu.Lock()
            if status == "success" {
                successCount++
            } else {
                failCount++
            }
            mu.Unlock()

            s.logger.Info("Proxy goroutine done",
                "module", "engine.scheduler",
                "proxy_label", r.Proxy.Label,
                "status", status,
                "duration_ms", duration.Milliseconds(),
            )
        }(run, gid)
    }

    wg.Wait()

    s.logger.Info("All proxies done",
        "module", "engine.scheduler",
        "total_duration_ms", time.Since(startTime).Milliseconds(),
        "success_count", successCount,
        "fail_count", failCount,
    )

    return nil
}
```

### 4.2 Panic Recovery

```go
func (s *Scheduler) recoverPanic(r RunConfig) {
    if p := recover(); p != nil {
        s.logger.Error("Proxy goroutine panic recovered",
            "module", "engine.scheduler",
            "proxy_label", r.Proxy.Label,
            "panic_message", fmt.Sprint(p),
            "stack_trace", string(debug.Stack()),
        )
    }
}
```

> **Tại sao panic recovery?** 1 proxy có bug → panic → nếu không recover → crash toàn bộ process → tất cả proxy khác cũng dừng. Recovery đảm bảo 9 proxy khác vẫn chạy bình thường.

### 4.3 Logging (5 events — module `engine.scheduler`)

| # | Event | Level | Fields |
|---|-------|-------|--------|
| 1 | Scheduler start | INFO | `proxy_count`, `max_parallel` |
| 2 | Proxy goroutine start | INFO | `proxy_label`, `goroutine_id` |
| 3 | Proxy goroutine done | INFO | `proxy_label`, `status` (success/failed), `duration_ms` |
| 4 | Proxy goroutine panic recovered | ERROR | `proxy_label`, `panic_message`, `stack_trace` |
| 5 | All proxies done | INFO | `total_duration_ms`, `success_count`, `fail_count` |

### Acceptance Criteria — Task 4
- [ ] 3+ proxies chạy song song → mỗi proxy tạo riêng test_run + kết quả riêng
- [ ] 1 proxy fail → proxies khác vẫn hoàn thành
- [ ] Max 10 parallel (semaphore hoạt động)
- [ ] Panic trong 1 proxy goroutine → recovered, proxies khác không ảnh hưởng
- [ ] Logs có `proxy_label` phân biệt từng proxy

---

## Task 5: Go Runner — Concurrency Burst Test

### Mục tiêu
Test proxy chịu tải đột biến — spawn 100 goroutines gửi GET /echo đồng thời, mỗi 5 phút. Burst test phát hiện proxy throttle hoặc rate limit khi nhiều request cùng lúc.

### Files cần sửa

```
runner/
└── internal/
    ├── engine/
    │   └── orchestrator.go        ← Thêm burst logic
    └── domain/
        └── types.go               ← Thêm burst config fields
```

### 5.1 Burst Config

```go
// runner/internal/domain/types.go — thêm vào RunConfig

type BurstConfig struct {
    ConcurrencyCount       int `json:"concurrency_count"`        // số goroutines burst (default 100)
    ConcurrencyBurstIntervalSec int `json:"concurrency_burst_interval_sec"` // mỗi N giây (default 300 = 5 phút)
}
```

### 5.2 Burst Implementation

```go
// runner/internal/engine/orchestrator.go — thêm burst logic

// Chạy trong Phase 3 (Continuous), mỗi 5 phút
func (o *Orchestrator) startBurstTicker(ctx context.Context, proxy ProxyConfig, cfg BurstConfig) {
    if cfg.ConcurrencyCount <= 0 {
        cfg.ConcurrencyCount = 100
    }
    if cfg.ConcurrencyBurstIntervalSec <= 0 {
        cfg.ConcurrencyBurstIntervalSec = 300
    }

    burstTicker := time.NewTicker(time.Duration(cfg.ConcurrencyBurstIntervalSec) * time.Second)
    defer burstTicker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-burstTicker.C:
            o.runBurst(ctx, proxy, cfg.ConcurrencyCount)
        }
    }
}

func (o *Orchestrator) runBurst(ctx context.Context, proxy ProxyConfig, count int) {
    o.logger.Info("Concurrency burst start",
        "module", "engine.orchestrator",
        "goroutine", "burst",
        "phase", "continuous",
        "run_id", o.runID,
        "concurrent_count", count,
    )

    var wg sync.WaitGroup
    var successCount, failCount int64
    var totalMS int64
    startTime := time.Now()

    for i := 0; i < count; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            reqStart := time.Now()
            err := doGETEcho(proxy, "http://target:3001/echo")
            duration := time.Since(reqStart)

            if err != nil {
                atomic.AddInt64(&failCount, 1)
            } else {
                atomic.AddInt64(&successCount, 1)
            }
            atomic.AddInt64(&totalMS, duration.Milliseconds())
        }()
    }

    wg.Wait()

    totalDuration := time.Since(startTime)
    avgMS := float64(0)
    total := successCount + failCount
    if total > 0 {
        avgMS = float64(totalMS) / float64(total)
    }

    o.logger.Info("Concurrency burst complete",
        "module", "engine.orchestrator",
        "goroutine", "burst",
        "phase", "continuous",
        "run_id", o.runID,
        "concurrent_count", count,
        "success_count", successCount,
        "fail_count", failCount,
        "avg_ms", avgMS,
        "total_duration_ms", totalDuration.Milliseconds(),
    )
}

// doGETEcho — single burst request
func doGETEcho(proxy ProxyConfig, targetURL string) error {
    proxyURL, _ := url.Parse(fmt.Sprintf("http://%s:%d", proxy.Host, proxy.Port))
    client := &http.Client{
        Timeout: 10 * time.Second,
        Transport: &http.Transport{
            Proxy: http.ProxyURL(proxyURL),
        },
    }
    resp, err := client.Get(targetURL)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode != 200 {
        return fmt.Errorf("burst request status %d", resp.StatusCode)
    }
    return nil
}
```

> **Burst results** ghi vào `http_sample` (is_warmup=false, method=GET, request_type="burst"). Reuse existing http_sample pipeline — không cần table mới.

### 5.3 Logging (2 events — module `engine.orchestrator`, goroutine `burst`)

| # | Event | Level | Fields |
|---|-------|-------|--------|
| 1 | Concurrency burst start | INFO | `run_id`, `concurrent_count`, `goroutine: "burst"`, `phase: "continuous"` |
| 2 | Concurrency burst complete | INFO | `run_id`, `concurrent_count`, `success_count`, `fail_count`, `avg_ms`, `goroutine: "burst"`, `phase: "continuous"` |

### Acceptance Criteria — Task 5
- [ ] Burst fires mỗi 5 phút (hoặc theo config)
- [ ] 100 goroutines gửi đồng thời GET /echo
- [ ] Success/fail count chính xác
- [ ] Burst results ghi vào http_sample với `request_type: "burst"`
- [ ] Logs có `goroutine: "burst"`, filter được riêng burst events

---

## Task 6: Go Runner — Scoring Upgrade (5 Components)

### Mục tiêu
Upgrade scoring từ 3 components → 5 components: thêm S_ws (WebSocket performance) và S_security (IP clean + geo match + IP stable + TLS). Tổng score phản ánh đầy đủ 5 khía cạnh proxy quality.

### Files cần sửa

```
runner/
└── internal/
    ├── scoring/
    │   └── scorer.go              ← Upgrade
    └── engine/
        └── result_collector.go    ← Include WS/IP data in summary
```

### 6.1 Scoring Formulas

**Sprint 1 (3 components)**:
```
score_total = 0.385 × S_uptime + 0.385 × S_latency + 0.230 × S_jitter
```

**Sprint 3 (5 components)**:
```go
// S_uptime (Weight: 0.25) — unchanged formula from Sprint 1
S_uptime := float64(successCount) / float64(totalSamples)

// S_latency (Weight: 0.25) — unchanged formula from Sprint 1
S_latency := computeLatencyScore(p95_ms)

// S_jitter (Weight: 0.15) — unchanged formula from Sprint 1
S_jitter := 1.0 - (jitter / maxJitter)

// S_ws (Weight: 0.15) — NEW Sprint 3
wsErrorRate := float64(ws_error_count) / float64(ws_sample_count)
wsDropRate := ws_drop_rate // from summary
wsHoldRatio := ws_avg_hold_ms / float64(ws_hold_duration_ms)
S_ws := 0.4*(1-wsErrorRate) + 0.3*(1-wsDropRate) + 0.3*wsHoldRatio

// S_security (Weight: 0.20) — NEW Sprint 3
ipClean := boolToFloat(summary.IPClean)        // 1.0 or 0.0
geoMatch := boolToFloat(summary.IPGeoMatch)     // 1.0 or 0.0
ipStable := boolToFloat(summary.IPStable)       // 1.0 or 0.0
tlsScore := computeTLSScore(tls_version)        // 1.0 if TLS 1.2+, 0.5 if 1.1, 0.0 otherwise
S_security := 0.30*ipClean + 0.25*geoMatch + 0.25*ipStable + 0.20*tlsScore

// Composite score (5 components)
score_total := 0.25*S_uptime + 0.25*S_latency + 0.15*S_jitter + 0.15*S_ws + 0.20*S_security
```

### 6.2 Phase Skipped — Weight Redistribution

```go
// Nếu WS chưa test (ws_sample_count == 0): redistribute S_ws weight (0.15)
// proportionally to other 4 components
if wsSkipped {
    // Original weights: uptime=0.25, latency=0.25, jitter=0.15, security=0.20
    // Sum without ws: 0.25+0.25+0.15+0.20 = 0.85
    // New weights: each = original / 0.85
    // uptime:   0.25/0.85 = 0.294
    // latency:  0.25/0.85 = 0.294
    // jitter:   0.15/0.85 = 0.176
    // security: 0.20/0.85 = 0.235
    score_total = 0.294*S_uptime + 0.294*S_latency + 0.176*S_jitter + 0.235*S_security
}

// Nếu IP check chưa chạy (ip_clean == nil): redistribute S_security weight (0.20)
if securitySkipped {
    // Original weights: uptime=0.25, latency=0.25, jitter=0.15, ws=0.15
    // Sum without security: 0.80
    // uptime:  0.25/0.80 = 0.3125
    // latency: 0.25/0.80 = 0.3125
    // jitter:  0.15/0.80 = 0.1875
    // ws:      0.15/0.80 = 0.1875
    score_total = 0.3125*S_uptime + 0.3125*S_latency + 0.1875*S_jitter + 0.1875*S_ws
}
```

### 6.3 Scorer Code

```go
// runner/internal/scoring/scorer.go
package scoring

import "log/slog"

type Scorer struct {
    logger *slog.Logger
}

type ScoreResult struct {
    Total     float64
    Grade     string
    SUptime   float64
    SLatency  float64
    SJitter   float64
    SWS       float64
    SSecurity float64
}

func (s *Scorer) Compute(summary *RunSummary) ScoreResult {
    // ... compute each component ...
    result := ScoreResult{
        SUptime:   sUptime,
        SLatency:  sLatency,
        SJitter:   sJitter,
        SWS:       sWS,
        SSecurity: sSecurity,
    }

    // Check skipped phases and redistribute
    // Phase skipped = runner did NOT attempt that test type (ws_enabled=false in config, or Sprint 1/2 run).
    // 0 samples with ws_enabled=true means WS FAILED (score 0.0), NOT skipped.
    // Check: wsSkipped = !config.ws_enabled || (WSSuccessCount == 0 && WSErrorCount == 0 && WSAttemptCount == 0)
    wsSkipped := summary.WSSuccessCount == 0 && summary.WSErrorCount == 0
    securitySkipped := summary.IPClean == nil

    if wsSkipped && securitySkipped {
        // Only 3 original components — Sprint 1 formula
        result.Total = 0.385*sUptime + 0.385*sLatency + 0.230*sJitter
        s.logger.Warn("Phase skipped in scoring",
            "module", "scoring.scorer",
            "skipped_phase", "ws+security",
            "weight_redistributed", true,
        )
    } else if wsSkipped {
        result.Total = 0.294*sUptime + 0.294*sLatency + 0.176*sJitter + 0.235*sSecurity
        s.logger.Warn("Phase skipped in scoring",
            "module", "scoring.scorer",
            "skipped_phase", "ws",
            "weight_redistributed", true,
        )
    } else if securitySkipped {
        result.Total = 0.3125*sUptime + 0.3125*sLatency + 0.1875*sJitter + 0.1875*sWS
        s.logger.Warn("Phase skipped in scoring",
            "module", "scoring.scorer",
            "skipped_phase", "security",
            "weight_redistributed", true,
        )
    } else {
        result.Total = 0.25*sUptime + 0.25*sLatency + 0.15*sJitter + 0.15*sWS + 0.20*sSecurity
    }

    // Determine grade
    result.Grade = computeGrade(result.Total)

    // Log component scores
    s.logger.Debug("Component scores",
        "module", "scoring.scorer",
        "s_uptime", result.SUptime,
        "s_latency", result.SLatency,
        "s_jitter", result.SJitter,
        "s_ws", result.SWS,
        "s_security", result.SSecurity,
    )

    s.logger.Info("Score computed",
        "module", "scoring.scorer",
        "run_id", summary.RunID,
        "score_total", result.Total,
        "grade", result.Grade,
    )

    return result
}
```

### 6.4 Grade Scale

| Grade | Score Range | Ý nghĩa |
|-------|-----------|---------|
| A | ≥ 0.90 | Xuất sắc |
| B | 0.75 – 0.89 | Tốt |
| C | 0.60 – 0.74 | Chấp nhận được |
| D | 0.40 – 0.59 | Kém |
| F | < 0.40 | Rất kém |

```go
func computeGrade(score float64) string {
    switch {
    case score >= 0.90: return "A"
    case score >= 0.75: return "B"
    case score >= 0.60: return "C"
    case score >= 0.40: return "D"
    default:            return "F"
    }
}
```

### 6.5 RunSummary Struct Update

```go
// runner/internal/engine/result_collector.go
// Thêm WS/IP fields vào RunSummary

type RunSummary struct {
    // ... existing HTTP fields from Sprint 1 ...
    RunID           string
    TotalSamples    int
    SuccessCount    int
    ErrorCount      int
    TTFBP50MS       float64
    TTFBP95MS       float64
    TTFBP99MS       float64
    UptimeRatio     float64
    ScoreUptime     float64
    ScoreLatency    float64
    ScoreJitter     float64
    ScoreTotal      float64
    Grade           string

    // WS fields (Sprint 3 — NEW)
    WSSuccessCount  int     `json:"ws_success_count"`
    WSErrorCount    int     `json:"ws_error_count"`
    WSRTTAvgMS      float64 `json:"ws_rtt_avg_ms"`
    WSRTTP95MS      float64 `json:"ws_rtt_p95_ms"`
    WSDropRate      float64 `json:"ws_drop_rate"`
    WSAvgHoldMS     float64 `json:"ws_avg_hold_ms"`
    WSSampleCount   int     `json:"ws_sample_count"`   // = WSSuccessCount + WSErrorCount

    // IP/Security fields (Sprint 3 — NEW)
    IPClean     *bool `json:"ip_clean"`      // pointer: nil = not checked
    IPGeoMatch  *bool `json:"ip_geo_match"`
    IPStable    *bool `json:"ip_stable"`

    // Scoring (expanded Sprint 3 — NEW)
    ScoreWS       float64 `json:"score_ws"`
    ScoreSecurity float64 `json:"score_security"`
}
```

### 6.6 Logging (4 events — module `scoring.scorer`)

| # | Event | Level | Fields |
|---|-------|-------|--------|
| 1 | Score computed | INFO | `run_id`, `score_total`, `grade` |
| 2 | Component scores | DEBUG | `s_uptime`, `s_latency`, `s_jitter`, `s_ws`, `s_security` |
| 3 | Phase skipped in scoring | WARN | `skipped_phase`, `weight_redistributed` |
| 4 | All metrics null | ERROR | `run_id` — không tính được score |

### Acceptance Criteria — Task 6
- [ ] Score total tính từ 5 components
- [ ] S_ws phản ánh đúng WS performance (error rate, drop rate, hold ratio)
- [ ] S_security phản ánh đúng IP clean + geo match + IP stable + TLS score
- [ ] Phase skipped → weight redistributed correctly
- [ ] run_summary có `score_ws`, `score_security` populated
- [ ] Grade: A (≥0.90), B (0.75-0.89), C (0.60-0.74), D (0.40-0.59), F (<0.40)

---

## Task 7: Controller API — WS/IP Endpoints Enhancement

### Mục tiêu
Đảm bảo API endpoints cho ws-samples và ip-checks hoạt động đầy đủ — batch insert, GET paginated, summary ws/ip fields. Tables đã tạo từ Sprint 1 DB schema.

### Files cần sửa/verify

```
api/
└── src/
    ├── routes/
    │   └── results.ts             ← WS/IP endpoints
    ├── services/
    │   └── runService.ts          ← WS/IP batch processing
    └── types/
        └── index.ts               ← WS/IP types (if needed)
```

### 7.1 Endpoints cần verify/complete

| Method | Path | Sprint 1 Status | Sprint 3 Action |
|--------|------|-----------------|-----------------|
| POST | `/api/v1/runs/:id/ws-samples/batch` | Stub/basic | Full batch insert (max 100/call) |
| POST | `/api/v1/runs/:id/ip-checks` | Stub/basic | Full insert + validation |
| GET | `/api/v1/runs/:id/ws-samples` | Stub/basic | Paginated (cursor-based) + filter |
| GET | `/api/v1/runs/:id/ip-checks` | Stub/basic | Full response with blacklist_sources |
| POST | `/api/v1/runs/:id/summary` | Working | Ensure ws_* + ip_* + score_ws + score_security saved |

### 7.2 WS Samples Batch Insert

```typescript
// POST /api/v1/runs/:id/ws-samples/batch
// Body: { samples: WSSample[] } — max 100 per call

router.post('/runs/:id/ws-samples/batch', async (req, res) => {
    const runId = req.params.id;
    const { samples } = req.body;

    // Validate
    if (!Array.isArray(samples) || samples.length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'samples must be non-empty array' } });
    }
    if (samples.length > 100) {
        return res.status(400).json({ error: { code: 'TOO_MANY', message: 'max 100 samples per batch' } });
    }

    // Verify run exists and is running
    const run = await runService.getRunById(runId);
    if (!run) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    if (run.status !== 'running') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Run not running' } });

    // Batch insert
    const inserted = await runService.insertWSSamples(runId, samples);

    // Update counter
    await runService.incrementWSSampleCount(runId, inserted);

    res.status(201).json({ data: { inserted } });
});
```

### 7.3 IP Check Insert

```typescript
// POST /api/v1/runs/:id/ip-checks
// Body: IPCheckResult

router.post('/runs/:id/ip-checks', async (req, res) => {
    const runId = req.params.id;
    const ipCheck = req.body;

    // Validate observed_ip is valid INET
    if (!isValidIP(ipCheck.observed_ip)) {
        return res.status(400).json({ error: { code: 'INVALID_IP', message: 'Invalid observed_ip' } });
    }

    // Insert
    const result = await runService.insertIPCheck(runId, ipCheck);
    res.status(201).json({ data: result });
});
```

### 7.4 WS Samples GET (Paginated)

```typescript
// GET /api/v1/runs/:id/ws-samples?cursor=xxx&limit=50&protocol=wss

router.get('/runs/:id/ws-samples', async (req, res) => {
    const runId = req.params.id;
    const cursor = req.query.cursor as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const protocol = req.query.protocol as string; // "ws" | "wss" | undefined

    const result = await runService.getWSSamples(runId, { cursor, limit, protocol });
    res.json({
        data: result.samples,
        pagination: {
            has_more: result.hasMore,
            next_cursor: result.nextCursor,
            total_count: result.totalCount,
        },
    });
});
```

### 7.5 IP Checks GET

```typescript
// GET /api/v1/runs/:id/ip-checks

router.get('/runs/:id/ip-checks', async (req, res) => {
    const runId = req.params.id;
    const result = await runService.getIPChecks(runId);
    res.json({ data: result });
});
```

### 7.6 Summary Update — ensure ws/ip fields

```typescript
// POST /api/v1/runs/:id/summary
// Body includes Sprint 3 fields:
// ws_success_count, ws_error_count, ws_rtt_avg_ms, ws_rtt_p95_ms,
// ws_drop_rate, ws_avg_hold_ms, ip_clean, ip_geo_match, ip_stable,
// score_ws, score_security, score_total

// Verify existing summary handler saves ALL fields:
await db.query(`
    INSERT INTO run_summary (run_id, /* ... existing fields ... */,
        ws_success_count, ws_error_count, ws_rtt_avg_ms, ws_rtt_p95_ms,
        ws_drop_rate, ws_avg_hold_ms, ip_clean, ip_geo_match, ip_stable,
        score_ws, score_security)
    VALUES ($1, /* ... */)
    ON CONFLICT (run_id) DO UPDATE SET /* ... all fields ... */
`, [runId, /* ... */]);
```

### 7.7 Logging

> Sử dụng existing API logging patterns từ Sprint 1 (routes.*, services.*, db.*). API call logging đã được Sprint 1 implement — mọi route đều log request start/success/fail. Không cần thêm log events mới.
>
> Cụ thể, các endpoint POST /ws-samples/batch và POST /ip-checks được cover bởi:
> - Sprint 1 pino-http middleware auto-logging (request/response cho mọi endpoint)
> - Sprint 1 route-level logging: request validation errors (400), database insert success/failure

### Acceptance Criteria — Task 7
- [ ] POST ws-samples/batch → insert ws_sample rows (max 100/call)
- [ ] POST ip-checks → insert ip_check_result row
- [ ] GET ws-samples → paginated response với cursor + protocol filter
- [ ] GET ip-checks → full ip_check_result with blacklist_sources
- [ ] POST summary → ws_* + ip_* + score_ws + score_security saved
- [ ] test_run.total_ws_samples counter updated correctly

---

## Task 8: Dashboard UI — WS/IP Display + Multi-proxy + Score Breakdown

### Mục tiêu
Cập nhật Dashboard hiển thị WS metrics, IP check results, 5-component score breakdown, WS samples tab trong Run Detail. Verify multi-proxy start flow hoạt động đúng.

### Files tạo/sửa

```
dashboard/src/
├── types/
│   └── index.ts                          ← Thêm WSSample, IPCheckResult types
├── hooks/
│   └── useRuns.ts                        ← Thêm useWSSamples, useIPChecks hooks
├── components/
│   └── runs/
│       ├── RunSummaryCards.tsx            ← Thêm WS + IP cards (4 → 6 cards)
│       ├── RunMetricsDetail.tsx          ← Thêm WS metrics section
│       ├── RunWSSamples.tsx              ← **MỚI** — WS samples table
│       ├── RunIPCheck.tsx                ← **MỚI** — IP check display
│       └── RunScoreBreakdown.tsx         ← **MỚI** — 5-component score breakdown
├── components/
│   └── test/
│       └── ProxySelector.tsx             ← Verify multi-proxy selection works
└── app/
    └── runs/
        └── [runId]/
            └── page.tsx                  ← Tabs: +WS, +IP, +Score
```

### 8.1 Types mới (thêm vào types/index.ts)

```typescript
// dashboard/src/types/index.ts — Sprint 3 additions

interface WSSample {
  id: string;
  run_id: string;
  seq: number;
  target_url: string;
  connected: boolean;
  error_type?: string;
  error_message?: string;
  tcp_connect_ms?: number;
  tls_handshake_ms?: number;
  handshake_ms?: number;
  message_rtt_ms?: number;
  started_at?: string;
  connection_held_ms?: number;
  disconnect_reason?: string;
  messages_sent: number;
  messages_received: number;
  drop_count: number;
  measured_at?: string;
}

interface IPCheckResult {
  id: string;
  run_id: string;
  observed_ip: string;
  expected_country?: string;
  actual_country?: string;
  actual_region?: string;
  actual_city?: string;
  geo_match?: boolean;
  blacklist_checked: boolean;
  blacklists_queried: number;
  blacklists_listed: number;
  blacklist_sources: string[];
  is_clean?: boolean;
  ip_stable?: boolean;
  ip_changes: number;
  checked_at?: string;
}

// RunSummary — Sprint 3 extended fields
interface RunSummary {
  // ... existing Sprint 1/2 fields ...
  run_id: string;
  total_samples: number;
  success_count: number;
  error_count: number;
  ttfb_p50_ms: number;
  ttfb_p95_ms: number;
  ttfb_p99_ms: number;
  uptime_ratio: number;
  score_uptime: number;
  score_latency: number;
  score_jitter: number;
  score_total: number;
  grade: string;

  // Sprint 3 additions
  ws_success_count?: number;
  ws_error_count?: number;
  ws_rtt_avg_ms?: number;
  ws_rtt_p95_ms?: number;
  ws_drop_rate?: number;
  ws_avg_hold_ms?: number;
  ip_clean?: boolean;
  ip_geo_match?: boolean;
  ip_stable?: boolean;
  score_ws?: number;
  score_security?: number;
}
```

### 8.2 Hooks mới

```typescript
// dashboard/src/hooks/useRuns.ts — Sprint 3 additions

// useWSSamples — GET /runs/:id/ws-samples
export function useWSSamples(runId: string) {
  const [samples, setSamples] = useState<WSSample[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWSSamples = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<WSSample[]>(`/runs/${runId}/ws-samples`, { limit: '50' });
      setSamples(res.data);
    } catch (err) {
      // API client logging already handles errors
    } finally {
      setLoading(false);
    }
  }, [runId]);

  return { samples, loading, fetchWSSamples };
}

// useIPChecks — GET /runs/:id/ip-checks
export function useIPChecks(runId: string) {
  const [checks, setChecks] = useState<IPCheckResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIPChecks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<IPCheckResult[]>(`/runs/${runId}/ip-checks`);
      setChecks(res.data);
    } catch (err) {
      // API client logging already handles errors
    } finally {
      setLoading(false);
    }
  }, [runId]);

  return { checks, loading, fetchIPChecks };
}
```

### 8.3 RunSummaryCards — Upgrade (4 → 6 cards)

```
Sprint 2 (4 cards):  Score | Latency P95 | Uptime % | Samples
Sprint 3 (6 cards):  Score | Latency P95 | Uptime % | Samples | WS RTT | IP Status
```

```tsx
// WS RTT card
<Card title="WS RTT">
  <div className="text-2xl font-bold">
    {summary?.ws_rtt_avg_ms?.toFixed(1) ?? '—'} ms
  </div>
  <div className="text-sm text-gray-500">
    Drop rate: {((summary?.ws_drop_rate ?? 0) * 100).toFixed(1)}%
  </div>
</Card>

// IP Status card
<Card title="IP Status">
  <div className="flex gap-2">
    <Badge variant={summary?.ip_clean ? 'success' : 'error'}>
      {summary?.ip_clean ? '✓ Clean' : '✗ Listed'}
    </Badge>
    <Badge variant={summary?.ip_geo_match ? 'success' : 'warning'}>
      {summary?.ip_geo_match ? '✓ Geo Match' : '✗ Mismatch'}
    </Badge>
  </div>
</Card>
```

### 8.4 RunScoreBreakdown — 5-component Display

```tsx
// dashboard/src/components/runs/RunScoreBreakdown.tsx

interface ScoreBreakdownProps {
  summary: RunSummary;
}

export function RunScoreBreakdown({ summary }: ScoreBreakdownProps) {
  const components = [
    { name: 'Uptime',   score: summary.score_uptime,   weight: 0.25, color: 'blue' },
    { name: 'Latency',  score: summary.score_latency,  weight: 0.25, color: 'green' },
    { name: 'Jitter',   score: summary.score_jitter,   weight: 0.15, color: 'yellow' },
    { name: 'WS',       score: summary.score_ws,       weight: 0.15, color: 'purple' },
    { name: 'Security', score: summary.score_security, weight: 0.20, color: 'red' },
  ];

  // Client log: Score breakdown loaded
  if (process.env.NODE_ENV === 'development') {
    console.debug('Score breakdown loaded', {
      run_id: summary.run_id,
      score_total: summary.score_total,
      components: components.length,
    });
  }

  return (
    <Card title={`Score: ${summary.score_total?.toFixed(2)} (${summary.grade})`}>
      {components.map((c) => (
        <div key={c.name} className="flex items-center gap-3 py-1">
          <span className="w-20 text-sm">{c.name}</span>
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div
              className={`bg-${c.color}-500 rounded-full h-3`}
              style={{ width: `${(c.score ?? 0) * 100}%` }}
            />
          </div>
          <span className="w-16 text-sm text-right font-mono">
            {c.score?.toFixed(2) ?? '—'}
          </span>
          <span className="w-12 text-xs text-gray-400">
            ×{c.weight}
          </span>
        </div>
      ))}
    </Card>
  );
}
```

**Score breakdown display**:
```
Score Total: 0.85 (B)
├── S_uptime:   0.98 (weight 0.25)  ████████████████████████████████████████▎ 0.98
├── S_latency:  0.85 (weight 0.25)  █████████████████████████████████▌       0.85
├── S_jitter:   0.72 (weight 0.15)  ████████████████████████████▊            0.72
├── S_ws:       0.90 (weight 0.15)  ████████████████████████████████████     0.90
└── S_security: 0.75 (weight 0.20)  ██████████████████████████████           0.75
```

### 8.5 RunWSSamples — WS Connections Table

```tsx
// dashboard/src/components/runs/RunWSSamples.tsx

interface RunWSSamplesProps {
  runId: string;
}

export function RunWSSamples({ runId }: RunWSSamplesProps) {
  const { samples, loading, fetchWSSamples } = useWSSamples(runId);

  useEffect(() => {
    fetchWSSamples();
    // Client log: WS samples tab loaded
    if (process.env.NODE_ENV === 'development') {
      console.debug('WS samples tab loaded', {
        run_id: runId,
        ws_sample_count: samples.length,
      });
    }
  }, [fetchWSSamples, runId, samples.length]);

  // Table columns: #, Protocol, Handshake ms, RTT avg, Messages, Drops, Held ms, Disconnect
  // Filter: protocol (ws/wss/all), errors only
}
```

**Table columns**:

| Column | Source | Width |
|--------|--------|-------|
| # | `seq` | 50px |
| Protocol | ws/wss from `target_url` | 80px |
| Handshake | `handshake_ms` | 100px |
| RTT avg | `message_rtt_ms` | 100px |
| Messages | `messages_sent` / `messages_received` | 120px |
| Drops | `drop_count` | 60px |
| Held | `connection_held_ms` | 100px |
| Disconnect | `disconnect_reason` badge | 120px |

### 8.6 RunIPCheck — IP Check Display

```tsx
// dashboard/src/components/runs/RunIPCheck.tsx

interface RunIPCheckProps {
  runId: string;
}

export function RunIPCheck({ runId }: RunIPCheckProps) {
  const { checks, loading, fetchIPChecks } = useIPChecks(runId);

  useEffect(() => {
    fetchIPChecks();
    // Client log: IP check loaded
    if (process.env.NODE_ENV === 'development' && checks.length > 0) {
      console.debug('IP check loaded', {
        run_id: runId,
        is_clean: checks[0]?.is_clean,
        geo_match: checks[0]?.geo_match,
      });
    }
  }, [fetchIPChecks, runId, checks]);

  // Display: Observed IP, Country match (✓/✗), Clean (✓/✗), Stable (✓/✗)
  // Blacklist details (sources if listed)
}
```

**IP Check display**:
```
┌──────────────────────────────────────────────┐
│ IP Check Results                              │
│                                              │
│ Observed IP: 45.67.89.123                    │
│ Country:     US (expected: US) ✓ Match       │
│ Region:      California                       │
│ City:        Los Angeles                      │
│                                              │
│ Blacklist:   ✓ Clean (0/4 listed)            │
│ IP Stable:   ✓ (0 changes)                   │
│                                              │
│ (if listed):                                  │
│ Blacklist:   ✗ Listed (1/4)                  │
│   Source: zen.spamhaus.org                    │
└──────────────────────────────────────────────┘
```

### 8.7 Run Detail Page — Tabs Update

```
Sprint 2: [HTTP Samples]
Sprint 3: [HTTP Samples] [WS Connections] [IP Check] [Score Breakdown]
```

```tsx
// dashboard/src/app/runs/[runId]/page.tsx — Sprint 3 tab addition

const tabs = [
  { id: 'http',  label: 'HTTP Samples',    component: <HttpSamples runId={runId} /> },
  { id: 'ws',    label: 'WS Connections',   component: <RunWSSamples runId={runId} /> },
  { id: 'ip',    label: 'IP Check',         component: <RunIPCheck runId={runId} /> },
  { id: 'score', label: 'Score Breakdown',  component: <RunScoreBreakdown summary={summary} /> },
];
```

### 8.8 Multi-proxy Verification

> ProxySelector component (Sprint 2 Task 5) đã hỗ trợ multi-select. Sprint 3 verify:
> - Select 3+ proxies → Start → 3 runs created, all status=running
> - Runs list hiện 3 concurrent runs
> - Each run Detail works independently

### 8.9 Dashboard Logging — Sprint 3 additions (3 events)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `pages/runs` (client) | WS samples tab loaded | console.debug | `run_id`, `ws_sample_count` |
| 2 | `pages/runs` (client) | IP check loaded | console.debug | `run_id`, `is_clean`, `geo_match` |
| 3 | `pages/runs` (client) | Score breakdown loaded | console.debug | `run_id`, `score_total`, `components` (5) |

> API calls tới ws-samples, ip-checks, summary đều đã được api-client logging cover (Sprint 2: 10 log points). Không cần thêm server-side logs.

### Acceptance Criteria — Task 8
- [ ] Run Detail hiển thị WS RTT, WS drop rate trong summary cards
- [ ] Run Detail hiển thị IP check: observed IP, geo match, clean status
- [ ] Score breakdown hiện 5 components với weight
- [ ] WS Connections tab hiện danh sách connections
- [ ] IP Check tab hiện blacklist details
- [ ] Multi-proxy start: chọn 3+ proxies → Start → tất cả running
- [ ] Runs list hiện multiple concurrent runs

---

## Task 9: Integration Test E2E

### Mục tiêu
Test toàn bộ Sprint 3 flow end-to-end: multi-proxy start, WS data, IP check, score breakdown, proxy isolation.

### 9.1 Kịch bản test (11 bước)

```
Bước 1:  docker compose up -d → 5 services start
Bước 2:  Dashboard → tạo 3 providers (BrightData, Oxylabs, SmartProxy)
Bước 3:  Tạo 1 proxy per provider (3 proxies total)
Bước 4:  Select all 3 proxies → Start Test → 3 runs created, all running
Bước 5:  Verify 3 runs chạy song song (Runs List → 3 ● Running)
Bước 6:  Wait 2-3 phút → verify WS data xuất hiện
Bước 7:  Check Run Detail → WS tab có ws_samples, IP tab có ip_check
Bước 8:  Check score breakdown → 5 components (S_ws, S_security populated)
Bước 9:  Stop 1 run → verify 2 remaining still running (proxy isolation)
Bước 10: Stop all → all completed
Bước 11: Verify final scores → 5 components, grade displayed
```

### 9.2 Verification Checks (25 functional)

| # | Check | Expected |
|---|-------|----------|
| 1 | 5 services start | `docker compose up` → all healthy |
| 2 | 3 proxies created | providers + proxies visible in Dashboard |
| 3 | Multi-proxy start | 3 runs created, status=running |
| 4 | Parallel execution | 3 runs active simultaneously |
| 5 | WS data appears | ws_sample rows in Run Detail WS tab |
| 6 | ws/wss alternation | ws_samples alternate ws:// and wss:// URLs |
| 7 | IP check appears | ip_check_result in Run Detail IP tab |
| 8 | GeoIP match | actual_country vs expected_country comparison |
| 9 | Blacklist check | blacklists_queried ≥ 4 |
| 10 | Score 5 components | score_ws + score_security populated (not null) |
| 11 | Score breakdown UI | 5 bars/items in breakdown component |
| 12 | WS RTT metric | ws_rtt_avg_ms > 0 in summary card |
| 13 | WS drop rate | ws_drop_rate displayed (0.0 – 1.0) |
| 14 | Concurrency burst | http_samples with request_type=burst (after 5 min) |
| 15 | Proxy isolation | Stop 1 run → other 2 still running |
| 16 | Graceful stop | running → stopping → completed transition |
| 17 | Final score correct | score_total reflects all 5 components |
| 18 | WS connections list | WS tab shows connection # + protocol + metrics |
| 19 | IP clean status | ✓ or ✗ displayed correctly |
| 20 | Score grade | A/B/C/D/F displayed based on score_total |
| 21 | Persistence | Close browser → reopen → data still there |
| 22 | Run Detail polling | WS/IP data updates every 3s while running |
| 23 | Multiple runs filter | Runs list filters work with 3+ runs |
| 24 | Overview stats | Active runs count = correct (matches running count) |
| 25 | Summary ws_* fields | run_summary has ws/ip/score data populated |

### 9.3 Logging Checks (RL1-RL10 — Runner Logging)

| # | Check | Verify command | Expected |
|---|-------|----------------|----------|
| RL1 | WS goroutine started | `docker compose logs runner \| jq 'select(.goroutine=="ws")'` | WS goroutine started, mpm, hold_duration |
| RL2 | ws/wss alternation | filter `Connection start` events | protocol alternates ws → wss → ws |
| RL3 | WSS CONNECT+TLS | filter `WSS CONNECT tunnel success` + `WSS TLS handshake success` | Both present for wss connections |
| RL4 | Per-connection summary | filter `Per-connection summary` | Each connection has all metrics |
| RL5 | IP check logs | filter `Blacklist check start` + `Geo lookup done` | IP check ran successfully |
| RL6 | Scheduler multi-proxy | filter `Scheduler start` | `proxy_count >= 3` |
| RL7 | Proxy isolation | filter `Proxy goroutine done` | Each proxy has status=success/failed |
| RL8 | Concurrency burst | filter `Concurrency burst complete` | success_count + fail_count > 0 |
| RL9 | Score 5 components | filter `Component scores` | s_ws + s_security present (not zero) |
| RL10 | WS goroutine stopped | filter `WS goroutine stopped` | total_connections, total_messages_sent, total_drops |

### 9.4 Quick Verify Script

```bash
#!/bin/bash
echo "=== Sprint 3 Verification ==="

# 1. WS goroutine running
echo ""
echo "--- 1. WS goroutine ---"
docker compose logs runner | grep '"WS goroutine started"' | head -3
docker compose logs runner | grep '"goroutine":"ws"' | head -5

# 2. ws/wss alternation
echo ""
echo "--- 2. WS/WSS alternation ---"
docker compose logs runner | grep '"Connection start"' | grep '"goroutine":"ws"' | head -10

# 3. IP check
echo ""
echo "--- 3. IP Check ---"
docker compose logs runner | grep '"Blacklist check start"' | head -3
docker compose logs runner | grep '"Geo lookup done"' | head -3

# 4. Scheduler multi-proxy
echo ""
echo "--- 4. Scheduler ---"
docker compose logs runner | grep '"Scheduler start"'

# 5. Burst test
echo ""
echo "--- 5. Concurrency burst ---"
docker compose logs runner | grep '"Concurrency burst"' | head -5

# 6. Score 5 components
echo ""
echo "--- 6. Scoring ---"
docker compose logs runner | grep '"Component scores"' | head -3

# 7. WS samples in DB
echo ""
echo "--- 7. WS samples ---"
docker compose exec postgres psql -U proxytest -c "SELECT COUNT(*) FROM ws_sample;"

# 8. IP check in DB
echo ""
echo "--- 8. IP checks ---"
docker compose exec postgres psql -U proxytest -c "SELECT observed_ip, actual_country, geo_match, is_clean, ip_stable FROM ip_check_result LIMIT 3;"

# 9. Run summary ws/ip fields
echo ""
echo "--- 9. Summary ws/ip ---"
docker compose exec postgres psql -U proxytest -c "SELECT score_total, score_ws, score_security, ws_success_count, ip_clean, grade FROM run_summary LIMIT 3;"

echo ""
echo "=== Sprint 3 Verification Complete ==="
```

### Acceptance Criteria — Task 9
- [ ] 25 functional checks pass
- [ ] RL1-RL10 logging checks pass
- [ ] Quick verify script runs without errors
- [ ] Multi-proxy flow: create → start 3 → verify parallel → stop isolation → final scores
- [ ] WS/IP data flows: Runner → API → DB → Dashboard display

---

## Logging Tổng kết Sprint 3

### Go Runner — Sprint 3 log points mới

| Module | Events | Level mix |
|--------|--------|-----------|
| `proxy.ws_tester` | 26 | INFO/DEBUG/WARN/ERROR |
| `ipcheck.blacklist` | 4 | INFO/WARN |
| `ipcheck.geoip` | 3 | INFO/WARN/ERROR |
| `engine.scheduler` (upgrade) | 5 | INFO/ERROR |
| `engine.orchestrator` (burst) | 2 | INFO |
| `scoring.scorer` (upgrade) | 4 | INFO/DEBUG/WARN/ERROR |
| `proxy.http_tester` (IP changed) | 1 | WARN |
| **Tổng Runner Sprint 3** | **45** | |

### Target Service — Sprint 3 log points mới

| Module | Events | Level mix |
|--------|--------|-----------|
| `ws.wsEcho` | 6 | INFO/DEBUG/ERROR |

### Dashboard — Sprint 3 log points mới

| Module | Events | Level mix |
|--------|--------|-----------|
| `pages/runs` (client) | 3 | console.debug |

> API calls tới ws-samples, ip-checks đã được api-client logging cover (Sprint 2, 10 log points). Không cần thêm server-side log.

### Sprint 3 Tổng log points mới: 54

| Service | Server | Client | Tổng |
|---------|--------|--------|------|
| Runner (Go) | 45 | 0 | 45 |
| Target (Node.js) | 6 | 0 | 6 |
| Dashboard (Next.js) | 0 | 3 | 3 |
| **Tổng Sprint 3** | **51** | **3** | **54** |

---

## Files tổng cộng Sprint 3

```
Tạo mới (6 files):
  runner/internal/proxy/ws_tester.go            ← WS tester full implementation
  runner/internal/ipcheck/blacklist.go          ← DNSBL blacklist check
  runner/internal/ipcheck/geoip.go              ← GeoIP verification
  dashboard/src/components/runs/RunWSSamples.tsx      ← WS samples table
  dashboard/src/components/runs/RunIPCheck.tsx         ← IP check display
  dashboard/src/components/runs/RunScoreBreakdown.tsx  ← 5-component breakdown

Sửa đổi (15 files):
  target/src/ws/wsEcho.ts                       ← Rewrite from placeholder → full echo
  runner/internal/domain/types.go               ← Thêm WSSample, IPCheckResult structs
  runner/go.mod                                 ← Thêm github.com/gorilla/websocket
  runner/internal/engine/scheduler.go           ← Multi-proxy parallel + panic recovery
  runner/internal/engine/orchestrator.go        ← Burst test + IP check Phase 1 integration
  runner/internal/engine/result_collector.go    ← WS/IP data in RunSummary
  runner/internal/scoring/scorer.go             ← 5-component scoring + grade
  api/src/routes/results.ts                     ← WS/IP endpoints full implementation
  api/src/services/runService.ts                ← WS/IP batch processing
  api/src/types/index.ts                        ← WS/IP TypeScript types (nếu cần, xem Task 7)
  dashboard/src/types/index.ts                  ← WSSample, IPCheckResult TypeScript types
  dashboard/src/hooks/useRuns.ts                ← useWSSamples, useIPChecks hooks
  dashboard/src/components/runs/RunSummaryCards.tsx    ← +WS RTT + IP Status cards
  dashboard/src/components/runs/RunMetricsDetail.tsx   ← +WS metrics section
  dashboard/src/app/runs/[runId]/page.tsx              ← Tabs: +WS, +IP, +Score Breakdown
```

**Tổng: 6 files mới + 15 files sửa = 21 files**

---

## Verification

### Functional Checks (25) — xem Task 9, Section 9.2

### Logging Checks (RL1-RL10) — xem Task 9, Section 9.3

### Quick Verify Script — xem Task 9, Section 9.4

> **Sprint 3 hoàn thành khi**: 25 functional checks ✓ + 10 logging checks ✓ + Quick verify script pass ✓ + Dashboard hiển thị WS/IP/Score breakdown đúng.
