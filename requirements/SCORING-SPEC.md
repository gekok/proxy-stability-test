# Scoring Specification — Proxy Stability Test System

> Tài liệu chi tiết về hệ thống chấm điểm proxy: trọng số, công thức, nguồn data, căn cứ chọn mốc, và hạn chế hiện tại.

| Field | Value |
|-------|-------|
| Date | 2026-02-27 |
| Status | Sprint 3 implemented, Sprint 4 planned (scoring improvements in Tasks 9-10) |
| Source files | `runner/internal/scoring/scorer.go`, `runner/internal/engine/result_collector.go` |

---

## 1. Tổng quan

Mỗi proxy được chấm **1 điểm tổng** (0.0 → 1.0) từ **5 thành phần có trọng số**:

```
ScoreTotal = 0.25 × S_uptime
           + 0.25 × S_latency
           + 0.15 × S_jitter
           + 0.15 × S_ws
           + 0.20 × S_security
```

| Thành phần | Trọng số | Câu hỏi nó trả lời |
|-----------|----------|---------------------|
| **Uptime** | 25% | Proxy có sống không? Bao nhiêu % request thành công? |
| **Latency** | 25% | Proxy có nhanh không? Mất bao lâu nhận byte đầu tiên? |
| **Jitter** | 15% | Proxy có ổn định không? Latency dao động ra sao? |
| **WebSocket** | 15% | Proxy giữ kết nối dài được không? Tin nhắn có mất không? |
| **Security** | 20% | IP sạch không? Quốc gia đúng không? TLS ổn không? |

### Xếp hạng (Grade)

| Grade | Score | Ý nghĩa |
|-------|-------|---------|
| **A** | ≥ 0.90 | Xuất sắc — dùng cho production |
| **B** | ≥ 0.75 | Tốt — chấp nhận được |
| **C** | ≥ 0.60 | Trung bình — cân nhắc |
| **D** | ≥ 0.40 | Kém — không nên dùng |
| **F** | < 0.40 | Fail — không dùng được |

---

## 2. Chi tiết từng thành phần

### 2.1 S_uptime (25%) — Tỷ lệ thành công

#### Công thức

```
S_uptime = successCount / totalSamples
```

- `successCount`: Số HTTP + HTTPS samples có `ErrorType == ""` (không lỗi)
- `totalSamples`: Tổng samples (loại bỏ warmup, `IsWarmup == true`)

#### Nguồn data

- File: `result_collector.go` → `ComputeSummary()`
- Mỗi HTTP/HTTPS request tạo 1 `HTTPSample` struct
- Sample thành công: nhận response, `StatusCode < 400`
- Sample lỗi: timeout, connection refused, proxy auth fail, CONNECT fail, v.v.

#### Ví dụ

| Scenario | Success | Total | S_uptime |
|----------|---------|-------|----------|
| Proxy tốt | 990 | 1000 | 0.990 |
| Proxy trung bình | 950 | 1000 | 0.950 |
| Proxy kém | 700 | 1000 | 0.700 |

#### Căn cứ trọng số 25%

- Đây là yêu cầu **cơ bản nhất** — proxy chết thì mọi thứ khác vô nghĩa
- Static residential proxy tốt nên đạt ≥ 99% uptime
- Trọng số ngang Latency vì cả 2 đều là tiêu chí sống còn

---

### 2.2 S_latency (25%) — Tốc độ phản hồi

#### Công thức

```
S_latency = clamp(1 - (TTFB_P95 / 500), 0, 1)
```

- `TTFB_P95`: Percentile 95 của Time To First Byte (ms) — chỉ tính samples thành công
- `500`: Mốc chuẩn (ms) — P95 ≥ 500ms → score = 0
- `clamp(x, 0, 1)`: Giới hạn kết quả trong khoảng [0, 1]

#### Nguồn data

- File: `result_collector.go` → `ComputeSummary()`
- TTFB đo từ `httptrace.ClientTrace.GotFirstResponseByte` (Go built-in)
- Percentile 95 = "95% requests nhanh hơn giá trị này"

#### Bảng chuyển đổi P95 → Score

| TTFB P95 (ms) | Công thức | S_latency | Đánh giá |
|----------------|-----------|-----------|----------|
| 0 (không có data) | — | 1.00 | Default perfect |
| 50 | 1 - 50/500 | 0.90 | Rất nhanh |
| 100 | 1 - 100/500 | 0.80 | Nhanh |
| 150 | 1 - 150/500 | 0.70 | Tốt |
| 200 | 1 - 200/500 | 0.60 | Chấp nhận được |
| 300 | 1 - 300/500 | 0.40 | Chậm |
| 400 | 1 - 400/500 | 0.20 | Rất chậm |
| ≥ 500 | 1 - 500/500 | 0.00 | Quá chậm |

#### Tại sao P95 chứ không phải trung bình?

Trung bình bị outlier kéo lệch. Ví dụ:
- 99 requests × 50ms + 1 request × 5000ms → trung bình = 99.5ms (trông tốt)
- Nhưng P95 = ~50ms, P99 ≈ 5000ms → thấy rõ vấn đề ở tail

P95 phản ánh trải nghiệm thực tế: "hầu hết requests của tôi sẽ nhanh hơn X ms".

#### Căn cứ mốc 500ms

- Static residential proxy cùng khu vực: TTFB thường 30-150ms
- Proxy khác khu vực (VD: VN proxy → US target): 150-400ms
- P95 > 500ms → proxy quá chậm cho hầu hết use case realtime (Zalo, chat, API)
- Mốc 500ms là điểm mà response time bắt đầu gây ra noticeable lag cho user

#### Căn cứ trọng số 25%

- Proxy nhanh = user experience tốt
- Ngang Uptime vì proxy sống nhưng chậm cũng không dùng được cho realtime apps

---

### 2.3 S_jitter (15%) — Độ ổn định

#### Công thức

```
S_jitter = clamp(1 - (Jitter / 100), 0, 1)
```

- `Jitter`: **Standard deviation** (độ lệch chuẩn) của `total_ms` — chỉ samples thành công
- `100`: Mốc chuẩn (ms) — stddev ≥ 100ms → score = 0

#### Nguồn data

- File: `result_collector.go` → `stddev(totals)`
- `total_ms` = thời gian toàn bộ request (TCP connect + TLS + TTFB + body)
- Cần ≥ 2 samples để tính stddev

```
stddev = sqrt( Σ(xi - mean)² / N )
```

#### Bảng chuyển đổi Jitter → Score

| Jitter / Stddev (ms) | S_jitter | Đánh giá |
|-----------------------|----------|----------|
| 5 | 0.95 | Cực kỳ ổn định |
| 10 | 0.90 | Rất ổn định |
| 20 | 0.80 | Ổn định |
| 40 | 0.60 | Trung bình |
| 60 | 0.40 | Không ổn |
| 80 | 0.20 | Rất bất ổn |
| ≥ 100 | 0.00 | Cực kỳ bất ổn |

#### Tại sao Jitter quan trọng?

Proxy A: latency trung bình 100ms, jitter 5ms → request nào cũng ~100ms → **ổn định, dự đoán được**
Proxy B: latency trung bình 80ms, jitter 80ms → lúc 20ms lúc 300ms → **bất ổn, khó dự đoán**

→ Proxy A **tốt hơn** dù latency trung bình cao hơn, vì ổn định quan trọng cho Zalo session liên tục.

#### Căn cứ mốc 100ms

- Residential proxy ổn định: stddev 5-30ms
- Proxy bất ổn (congestion, routing thay đổi): stddev 50-100ms+
- Stddev > 100ms = proxy không đáng tin cho workload cần consistency

#### Căn cứ trọng số 15%

- Quan trọng nhưng không bằng Uptime/Latency
- Proxy ổn định (jitter thấp) giúp dự đoán performance, nhưng nếu uptime thấp hoặc latency cao thì jitter thấp cũng vô nghĩa

---

### 2.4 S_ws (15%) — WebSocket Quality

#### Công thức

```
S_ws = 0.4 × (1 - wsErrorRate)
     + 0.3 × (1 - wsDropRate)
     + 0.3 × wsHoldRatio
```

3 sub-components:

#### 2.4a WS Connection Error Rate (40% of S_ws)

```
wsErrorRate = WSErrorCount / (WSSuccessCount + WSErrorCount)
```

- `WSSuccessCount`: WS samples có `Connected == true`
- `WSErrorCount`: WS samples có `Connected == false`
- Nguồn: `result_collector.go` → `ComputeWSSummary()`

| Ví dụ | wsErrorRate | Sub-score |
|-------|-------------|-----------|
| 0 fail / 20 connections | 0.00 | 1.00 |
| 2 fail / 20 connections | 0.10 | 0.90 |
| 10 fail / 20 connections | 0.50 | 0.50 |

**Trọng số 40%** — kết nối được là tiền đề, không connect = không gì hoạt động.

#### 2.4b WS Message Drop Rate (30% of S_ws)

```
wsDropRate = totalDrops / totalMessagesSent
```

- `totalDrops`: Tổng `DropCount` qua tất cả WS samples
- `totalMessagesSent`: Tổng `MessagesSent` qua tất cả WS samples
- Drop = message gửi đi nhưng không nhận echo lại trong 5s

| Ví dụ | wsDropRate | Sub-score |
|-------|------------|-----------|
| 0 drop / 500 sent | 0.000 | 1.00 |
| 5 drop / 500 sent | 0.010 | 0.99 |
| 50 drop / 500 sent | 0.100 | 0.90 |

**Trọng số 30%** — mất tin nhắn = data integrity issue, quan trọng cho Zalo messaging.

#### 2.4c WS Hold Ratio (30% of S_ws)

```
wsHoldRatio = clamp(WSAvgHoldMS / 60000, 0, 1)
```

- `WSAvgHoldMS`: Trung bình `ConnectionHeldMS` các WS samples
- `60000`: Target 60 giây (60,000ms)
- WS tester yêu cầu hold bằng query param `?hold=60000`

| Avg Hold | wsHoldRatio | Sub-score |
|----------|-------------|-----------|
| 60s | 1.00 | 1.00 |
| 45s | 0.75 | 0.75 |
| 30s | 0.50 | 0.50 |
| 10s | 0.17 | 0.17 |
| 2s | 0.03 | 0.03 |

**Trọng số 30%** — proxy giữ WS lâu = phù hợp cho long-lived connections (Zalo cần WS liên tục).

#### Ví dụ tổng hợp S_ws

```
Proxy tốt:  0.4×(1-0.00) + 0.3×(1-0.01) + 0.3×(55000/60000) = 0.4 + 0.297 + 0.275 = 0.972
Proxy kém:  0.4×(1-0.20) + 0.3×(1-0.10) + 0.3×(10000/60000) = 0.32 + 0.27  + 0.05  = 0.640
```

#### Căn cứ trọng số 15% (toàn cục)

- Zalo dùng WebSocket cho real-time messaging → cần test WS
- Nhưng HTTP/HTTPS vẫn là phần lớn traffic (API calls, file uploads) → WS không nên chiếm quá nhiều
- 15% đủ để proxy có WS kém bị phạt nhưng không quá nặng

---

### 2.5 S_security (20%) — An toàn IP

#### Công thức

```
S_security = 0.30 × ipClean
           + 0.25 × geoMatch
           + 0.25 × ipStable
           + 0.20 × tlsScore
```

4 sub-components, **tất cả đều binary (0.0 hoặc 1.0)**:

#### 2.5a IP Clean — Blacklist Check (30% of S_security)

```
ipClean = 1.0 nếu BlacklistListed == 0 (không bị listed ở server nào)
ipClean = 0.0 nếu BlacklistListed > 0  (bị listed ở ≥ 1 server)
```

- Nguồn: `ipcheck/blacklist.go` → DNSBL lookup 4 servers
- Servers: Spamhaus, Barracuda, SpamCop, SORBS
- Kỹ thuật: Reverse IP lookup (VD: `3.2.1.103.zen.spamhaus.org`)
- DNS resolve → listed (dirty), DNS not found → clean

**Trọng số 30%** — IP bị blacklist = rủi ro cao nhất: email bị block, tài khoản bị ban, platform phát hiện.

#### 2.5b Geo Match — Xác minh quốc gia (25% of S_security)

```
geoMatch = 1.0 nếu actualCountryCode == expectedCountry (case-insensitive)
geoMatch = 0.0 nếu actualCountryCode != expectedCountry
geoMatch = 1.0 nếu expectedCountry rỗng (user không set → default match)
```

- Nguồn: `ipcheck/geoip.go` → HTTP GET `ip-api.com/json/{ip}`
- So sánh `expected_country` (user nhập khi tạo proxy) với `countryCode` từ API

**Trọng số 25%** — Mua proxy VN mà IP thực tế US = Zalo phát hiện bất thường, tài khoản bị flag.

#### 2.5c IP Stable — IP không đổi (25% of S_security)

```
ipStable = 1.0 nếu IP không đổi suốt session
ipStable = 0.0 nếu IP thay đổi giữa chừng
```

**Trọng số 25%** — IP đổi giữa session = platform coi là suspicious activity, session bị invalidate.

#### 2.5d TLS Score — Hỗ trợ HTTPS (20% of S_security)

```
tlsScore = 1.0 nếu có HTTPS samples thành công (HTTPSSampleCount > 0 && TLSP50MS > 0)
tlsScore = 0.0 nếu không có HTTPS samples hoặc TLS fail
```

**Trọng số 20%** — Proxy không hỗ trợ TLS = data đi qua plaintext, bị sniff.

#### Ví dụ tổng hợp S_security

| Scenario | ipClean | geoMatch | ipStable | tlsScore | S_security |
|----------|---------|----------|----------|----------|------------|
| Proxy hoàn hảo | 1.0 | 1.0 | 1.0 | 1.0 | **1.00** |
| Bị blacklist 1 server | 0.0 | 1.0 | 1.0 | 1.0 | **0.70** |
| Geo sai quốc gia | 1.0 | 0.0 | 1.0 | 1.0 | **0.75** |
| IP đổi + geo sai | 1.0 | 0.0 | 0.0 | 1.0 | **0.50** |
| Tất cả fail | 0.0 | 0.0 | 0.0 | 0.0 | **0.00** |

#### Căn cứ trọng số 20% (toàn cục)

- IP an toàn = tài khoản Zalo không bị ban
- Quan trọng hơn Jitter/WS nhưng không bằng Uptime/Latency
- Proxy bị blacklist hoặc geo sai → rủi ro business nghiêm trọng

---

## 3. Weight Redistribution — Tự phân bổ lại trọng số

Không phải lúc nào cũng có đủ 5 thành phần. Khi phase bị skip, trọng số được **tự phân bổ lại** sao cho tổng vẫn = 1.0.

### Cách tính

```
Trọng số mới = Trọng số gốc / Tổng trọng số còn lại
```

### 4 trường hợp

#### Đủ 5 thành phần

```
0.25×U + 0.25×L + 0.15×J + 0.15×WS + 0.20×S = 1.00
```

#### Skip WS (WSSampleCount == 0)

Tổng còn lại = 0.25 + 0.25 + 0.15 + 0.20 = 0.85

```
(0.25/0.85)×U + (0.25/0.85)×L + (0.15/0.85)×J + (0.20/0.85)×S
= 0.294×U + 0.294×L + 0.176×J + 0.235×S = 1.00
```

#### Skip Security (IPClean == nil)

Tổng còn lại = 0.25 + 0.25 + 0.15 + 0.15 = 0.80

```
(0.25/0.80)×U + (0.25/0.80)×L + (0.15/0.80)×J + (0.15/0.80)×WS
= 0.3125×U + 0.3125×L + 0.1875×J + 0.1875×WS = 1.00
```

#### Skip cả WS + Security (backward compat Sprint 1/2)

Tổng còn lại = 0.25 + 0.25 + 0.15 = 0.65

```
(0.25/0.65)×U + (0.25/0.65)×L + (0.15/0.65)×J
= 0.385×U + 0.385×L + 0.230×J = 1.00
```

### Khi nào phase bị skip?

| Phase | Điều kiện skip | Lý do |
|-------|----------------|-------|
| WS | `WSSampleCount == 0` | WS tester không connect được, hoặc chưa có sample nào |
| Security | `IPClean == nil` | IP check fail (không lấy được IP qua proxy), hoặc orchestrator skip |

---

## 4. Data Pipeline — Từ raw request → score

```
                    HTTP/HTTPS requests
                    (500 + 500 RPM)
                          │
                          ▼
              ┌───────────────────────┐
              │     HTTPSample        │
              │  (seq, status_code,   │
              │   tcp_connect_ms,     │
              │   tls_handshake_ms,   │
              │   ttfb_ms, total_ms,  │
              │   error_type, ...)    │
              └───────────┬───────────┘
                          │
         ┌────────────────┼──────────────────┐
         │                │                  │
         ▼                ▼                  ▼
    successCount     ttfb values       total_ms values
    / totalCount     (thành công)      (thành công)
         │                │                  │
         ▼                ▼                  ▼
     S_uptime       percentile(95)      stddev()
     = ratio        → S_latency         → S_jitter


                    WS connections
                    (60 msg/min)
                          │
                          ▼
              ┌───────────────────────┐
              │      WSSample         │
              │  (connected, rtt_ms,  │
              │   messages_sent,      │
              │   drop_count,         │
              │   connection_held_ms, │
              │   ...)                │
              └───────────┬───────────┘
                          │
         ┌────────────────┼──────────────────┐
         │                │                  │
         ▼                ▼                  ▼
    errorRate        dropRate           avgHoldMS
    (connect fail)   (msg lost)         / 60000
         │                │                  │
         ▼                ▼                  ▼
      0.4×(1-x)     0.3×(1-x)          0.3×ratio
         └────────────────┼──────────────────┘
                          ▼
                        S_ws


                    IP Check
                    (1 lần đầu run)
                          │
                          ▼
              ┌───────────────────────┐
              │    IPCheckResult      │
              │  (is_clean, geo_match,│
              │   ip_stable)          │
              └───────────┬───────────┘
                          │
         ┌────────────────┼──────────────────┐
         │                │                  │         HTTPS samples
         ▼                ▼                  ▼              │
    0.30×ipClean   0.25×geoMatch    0.25×ipStable    0.20×tlsScore
         └────────────────┼──────────────────┘              │
                          ▼                                 │
                      S_security ◄──────────────────────────┘


              ┌─────────────────────────────┐
              │     Final Score             │
              │                             │
              │  0.25×S_uptime              │
              │ +0.25×S_latency             │
              │ +0.15×S_jitter              │
              │ +0.15×S_ws                  │
              │ +0.20×S_security            │
              │ = ScoreTotal (0.0 → 1.0)    │
              │                             │
              │ → Grade: A/B/C/D/F          │
              └─────────────────────────────┘
```

---

## 5. Timing — Khi nào score được tính?

| Thời điểm | Trigger | Mục đích |
|-----------|---------|----------|
| **Mỗi 30 giây** | `rollingSummary()` ticker | Cập nhật realtime trên Dashboard |
| **Khi stop test** | `Run()` → Phase 5 final_summary | Score cuối cùng, chính xác nhất |

Cả 2 đều gọi cùng pipeline:
```
ComputeSummary(allSamples) → ComputeWSSummary() → gắn IP data → ComputeScore()
```

Score chạy càng lâu càng chính xác vì:
- Nhiều samples hơn → percentile ổn định hơn
- Jitter phản ánh đúng hơn với sample size lớn
- WS hold ratio ổn định hơn qua nhiều connections

---

## 6. Hạn chế hiện tại & cải tiến tiềm năng

### 6.1 Security scores binary (0 hoặc 1)

**Hiện tại**: IP bị listed ở 1/4 server → `ipClean = 0` (giống bị listed 4/4)

**Cải tiến**: Dùng gradient:
```
ipClean = 1 - (blacklistListed / blacklistQueried)
// 1/4 listed → 0.75 thay vì 0.0
// 4/4 listed → 0.00
```

→ **Fix planned**: Sprint 4 Task 9.2 — `ipCleanGradient()` function

### 6.2 IP Stability chỉ check 1 lần

**Hiện tại**: `orchestrator.go:336-337` hardcode `IPStable = true`, `IPChanges = 0`. IP chỉ kiểm tra 1 lần ở Phase 1 (đầu run).

**Cải tiến**: Periodic re-check IP mỗi 30s-60s, so sánh với `observedIP` ban đầu:
```
if newIP != observedIP → IPStable = false, IPChanges++
```

→ **Fix planned**: Sprint 4 Task 9.1 — IP re-check goroutine every 60s with mutex protection

### 6.3 Mốc chuẩn hardcode

**Hiện tại**:
- Latency mốc: 500ms (hardcode trong `scorer.go:27`)
- Jitter mốc: 100ms (hardcode trong `scorer.go:33`)
- WS hold target: 60000ms (hardcode trong `scorer.go:54`)

**Cải tiến**: Cho phép configure qua RunConfig hoặc Dashboard UI:
```json
{
  "scoring_config": {
    "latency_threshold_ms": 500,
    "jitter_threshold_ms": 100,
    "ws_hold_target_ms": 60000
  }
}
```

→ **Fix planned**: Sprint 4 Task 9.4 — `ScoringConfig` struct with `DefaultScoringConfig()`, Task 10.3 — Dashboard TestConfigForm collapsible section

### 6.4 TLS Score đơn giản

**Hiện tại**: `tlsScore = 1.0` nếu có bất kỳ HTTPS sample thành công nào → không phân biệt TLS 1.2 vs 1.3.

**Cải tiến**:
```
tlsScore = 1.0 nếu TLS 1.3 (majority)
tlsScore = 0.7 nếu TLS 1.2
tlsScore = 0.0 nếu < TLS 1.2 hoặc không có HTTPS
```

→ **Fix planned**: Sprint 4 Task 9.3 — `tlsVersionScore()` function, Task 10.1 — `majority_tls_version` + `tls_version_score` DB columns

### 6.5 Trọng số không configurable

**Hiện tại**: 5 trọng số hardcode (`const wUptime = 0.25`, ...).

**Cải tiến**: Cho phép user tùy chỉnh trọng số theo use case:
- Streaming app → tăng WS, giảm Security
- Banking app → tăng Security, tăng Uptime
- Chat app (Zalo) → cân bằng như hiện tại

### 6.6 Không có trend/degradation detection

**Hiện tại**: Score tính trên toàn bộ data tích lũy → không phát hiện proxy tốt lúc đầu nhưng xấu dần.

**Cải tiến**: Sliding window (VD: 5 phút gần nhất) + so sánh với overall → alert khi score giảm > threshold.

---

## 7. Tham chiếu source code

| File | Chức năng |
|------|-----------|
| `runner/internal/scoring/scorer.go` | ComputeScore(), ComputeGrade(), weight redistribution |
| `runner/internal/engine/result_collector.go` | ComputeSummary(), ComputeWSSummary(), percentile(), stddev() |
| `runner/internal/engine/orchestrator.go` | runIPCheck(), rollingSummary(), Phase 5 final_summary |
| `runner/internal/ipcheck/blacklist.go` | CheckBlacklist() — DNSBL 4 servers |
| `runner/internal/ipcheck/geoip.go` | CheckGeoIP(), CheckGeoMatch() — ip-api.com |
| `runner/internal/domain/types.go` | IPCheckResult, RunSummary, WSSample structs |
