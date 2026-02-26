# Giải thích Sprint 1 — Foundation

---

## 0. Sprint 1 làm gì?

```
Input:  Không có code, bắt đầu từ zero
Output: 5 services Docker chạy local, test được 1 proxy (HTTP + HTTPS), kết quả vào database
```

Sprint 1 xây **nền móng** cho toàn bộ hệ thống. Giống xây nhà — phải đổ móng, dựng khung trước khi lắp nội thất.

**Sau Sprint 1, anh gõ 1 lệnh**:
```bash
docker compose up -d
```
→ 5 services tự khởi động → anh gọi API tạo proxy → bấm start → Runner tự test → kết quả tự chảy vào database.

Chưa có giao diện đẹp (Sprint 2), chưa có WebSocket test (Sprint 3), chưa có charts (Sprint 4) — nhưng **xương sống đã hoạt động**.

---

## 1. Có gì trong Sprint 1? (9 tasks)

### Nhìn nhanh

```
                ┌──────────────────────────────────────────────┐
                │            docker compose up -d              │
                │                                              │
                │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
                │  │ postgres │  │  target   │  │ dashboard │  │
                │  │  (DB)    │  │ (HTTP +   │  │ (placeholder)│
                │  │ 7 tables │  │  HTTPS)   │  │           │  │
                │  └────┬─────┘  └─────┬─────┘  └───────────┘  │
                │       │              │                        │
                │  ┌────▼─────┐  ┌─────▼─────┐                │
                │  │   api    │──│  runner    │                │
                │  │ (REST    │  │ (Go test   │                │
                │  │  CRUD)   │  │  engine)   │                │
                │  └──────────┘  └───────────┘                │
                └──────────────────────────────────────────────┘
```

### 9 Tasks theo thứ tự

| Task | Tên | Làm gì | Tại sao cần |
|------|-----|--------|-------------|
| 1 | Project Setup | Tạo folders, Docker Compose, database 7 tables | Không có DB → không lưu được gì |
| 2 | Target Service | Server HTTP (:3001) + HTTPS (:3443) cho Runner gọi tới | Runner cần 1 đích để gửi request tới qua proxy |
| 3 | Controller API | REST API CRUD providers, proxies, runs + nhận kết quả | Cầu nối giữa user ↔ Runner ↔ Database |
| 4 | Runner Foundation | Go HTTP server chờ lệnh, TCP dialer kết nối proxy | Khung sườn Runner, chưa test gì |
| 5 | HTTP Tester | Goroutine 1: test plain HTTP qua proxy, 6 methods | Đo proxy qua HTTP thuần |
| 6 | HTTPS Tester | Goroutine 2: test HTTPS qua CONNECT tunnel, 6 methods | Đo proxy qua HTTPS (quan trọng hơn HTTP) |
| 7 | Engine | Orchestrator (quản lý goroutines), Scheduler, Result Collector | Bộ não điều phối test |
| 8 | Reporter + Scorer | Gửi kết quả về API, tính điểm proxy | Không gửi kết quả = test xong không ai biết |
| 9 | Integration Test | Chạy toàn bộ luồng E2E kiểm tra | Chắc chắn mọi thứ hoạt động cùng nhau |

### Thứ tự dependency

```
Task 1 (Setup)
  ├── Task 2 (Target)       ← làm song song với Task 3
  └── Task 3 (API)          ← cần DB từ Task 1
        └── Task 4 (Runner Foundation)
              ├── Task 5 (HTTP Tester)    ← làm song song với Task 6
              └── Task 6 (HTTPS Tester)
                    └── Task 7 (Engine)
                          └── Task 8 (Reporter + Scorer)
                                └── Task 9 (Integration Test)
```

---

## 2. Giải thích từng Task

### Task 1 — Project Setup + Docker Compose + Database

**Làm gì**: Tạo cấu trúc folder, file `docker-compose.yml` định nghĩa 5 services, database schema 7 tables.

**Tại sao cần 7 tables?**

| Table | Lưu gì | Ví dụ |
|-------|--------|-------|
| `provider` | Nhà cung cấp proxy | "BrightData", "Oxylabs" |
| `proxy_endpoint` | Thông tin proxy | host, port, user/pass (mã hóa) |
| `test_run` | 1 lần test 1 proxy | status, config, thời gian bắt đầu/kết thúc |
| `http_sample` | Kết quả MỖI request | latency, status code, method, lỗi nếu có |
| `ws_sample` | Kết quả WS connection | (tạo sẵn, Sprint 3 mới dùng) |
| `ip_check_result` | Kết quả check IP | (tạo sẵn, Sprint 3 mới dùng) |
| `run_summary` | Điểm tổng hợp | uptime, latency p95, score |

> Tạo sẵn 7 tables dù Sprint 1 chỉ dùng 5 — để sau không phải sửa schema.

**Sau Task 1**: `docker compose up -d` → postgres chạy, 7 tables tồn tại.

---

### Task 2 — Target Service

**Làm gì**: Server Node.js listen 2 ports — HTTP (:3001) và HTTPS (:3443). Runner sẽ gửi request QUA PROXY tới server này.

**Tại sao cần Target Service?**

```
Không có Target:
  Runner → Proxy → ??? (gửi tới đâu?)

Có Target:
  Runner → Proxy → Target Service → trả response về
                    ↑
              Server của mình, biết chính xác response đúng/sai
```

Target có **5 endpoints**:

| Endpoint | Dùng để | Ví dụ |
|----------|---------|-------|
| `GET /health` | Kiểm tra Target sống | `{"status":"ok"}` |
| `ALL /echo` | Test 6 HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD) | Echo lại body + headers |
| `GET /ip` | Xem IP client (qua proxy → thấy IP proxy) | `{"ip":"103.1.2.3"}` |
| `GET /large?size=N` | Đo bandwidth (tải N bytes) | 1MB random data |
| `GET /slow?delay=N` | Đo timeout handling (chờ N ms) | Chờ 2 giây rồi trả |

**Tại sao cần cả HTTP và HTTPS?**
- HTTP (:3001) → đo proxy xử lý plain request
- HTTPS (:3443) → đo proxy xử lý CONNECT tunnel + TLS
- So sánh 2 cái → biết proxy có penalty khi dùng HTTPS không

**Sau Task 2**: `curl http://localhost:3001/echo` → trả response. `curl -k https://localhost:3443/echo` → trả response.

---

### Task 3 — Controller API

**Làm gì**: REST API (Express + TypeScript) quản lý data + làm cầu nối giữa user ↔ Runner.

**Flow**:
```
User (curl/Postman)
  │
  ├── POST /providers     → tạo nhà cung cấp
  ├── POST /proxies       → tạo proxy (password tự mã hóa)
  ├── POST /runs          → tạo test run
  ├── POST /runs/start    → GỌI RUNNER "hãy test đi"
  ├── POST /runs/:id/stop → GỌI RUNNER "dừng test"
  │
  │   Runner tự gọi lại:
  ├── POST /runs/:id/http-samples/batch  → Runner gửi 50 kết quả/lần
  └── POST /runs/:id/summary            → Runner gửi điểm tổng hợp
```

**Tại sao password mã hóa?**
- Proxy password nhạy cảm → lưu plaintext trong DB = nguy hiểm
- API dùng AES-256-GCM (mã hóa quân sự) → password được encrypt trước khi lưu
- Khi Runner cần password → API decrypt rồi gửi cho Runner
- Trả về API cho user → KHÔNG BAO GIỜ trả password

**Sau Task 3**: CRUD hoạt động, gọi start → Runner nhận trigger.

---

### Task 4 — Go Runner Foundation

**Làm gì**: Khung sườn Runner — HTTP server chờ API gọi lệnh, TCP dialer kết nối proxy.

**Runner hoạt động như thế nào?**
```
1. Runner start → listen port :9090 → CHỜ lệnh
2. API gọi POST /trigger → Runner nhận danh sách proxy cần test
3. Runner test proxy → gửi kết quả về API
4. API gọi POST /stop → Runner dừng gracefully
```

**TCP Dialer là gì?**
```
Bình thường:  App → Internet → Target
Qua proxy:    App → Proxy → Internet → Target
                     ↑
              Dialer kết nối TCP tới proxy trước
              Rồi gửi request qua proxy tới target
```

**Sau Task 4**: Runner listen :9090, nhận trigger + stop, connect được tới proxy qua TCP.

---

### Task 5 — HTTP Tester (Goroutine 1)

**Làm gì**: Test plain HTTP qua proxy. Xoay vòng 6 methods. 500 requests/phút.

**Tại sao test 6 methods?**
```
Hệ thống Zalo dùng:
  GET    — đọc data (lấy tin nhắn, profile)
  POST   — gửi data (đăng nhập, gửi tin nhắn)
  PUT    — cập nhật (đổi avatar, tên)
  PATCH  — sửa 1 phần (update status)
  DELETE — xoá (xoá tin nhắn)
  HEAD   — check tồn tại (kiểm tra file)

→ Proxy có thể block 1 method nhưng cho phép method khác
→ Test đủ 6 methods mới biết proxy hỗ trợ đầy đủ không
```

**Xoay vòng ra sao?**
```
Request  1: GET /echo
Request  2: POST /echo     (gửi JSON body)
Request  3: PUT /echo      (gửi body update)
Request  4: PATCH /echo    (gửi partial body)
Request  5: DELETE /echo
Request  6: HEAD /echo     (chỉ headers, không body)
Request  7: GET /echo      ← lặp lại từ đầu
...
Mỗi 10 vòng xen kẽ:
  GET /large?size=1MB      ← đo bandwidth
  GET /slow?delay=2s       ← đo timeout handling
Mỗi 30 giây:
  GET /ip                  ← check IP có đổi không
```

**Đo gì với mỗi request?**
- `tcp_connect_ms` — thời gian kết nối TCP tới proxy
- `ttfb_ms` — Time to First Byte (từ gửi đến nhận byte đầu tiên)
- `total_ms` — tổng thời gian request
- `status_code` — 200 = OK, khác = lỗi
- `bytes_sent` / `bytes_received` — lượng data truyền

**Sau Task 5**: HTTP goroutine gửi 500 RPM qua proxy, xoay 6 methods, kết quả vào `http_sample` table.

---

### Task 6 — HTTPS Tester (Goroutine 2)

**Làm gì**: Test HTTPS qua CONNECT tunnel. Cũng 6 methods, cũng 500 RPM. Nhưng phức tạp hơn HTTP vì có 3 giai đoạn.

**Tại sao HTTPS quan trọng hơn HTTP?**
- 90%+ traffic internet ngày nay là HTTPS
- Zalo dùng HTTPS cho mọi API
- HTTPS qua proxy phức tạp hơn → dễ gặp lỗi hơn → cần test kỹ hơn

**3 giai đoạn mỗi HTTPS request**:
```
Giai đoạn 1: CONNECT tunnel
  Runner nói với Proxy: "Mở đường hầm tới Target:3443"
  Proxy trả: "200 Connection Established" (OK) hoặc lỗi
  → Có thể gãy ở đây: proxy từ chối, auth fail, timeout

Giai đoạn 2: TLS handshake
  Runner bắt tay TLS với Target QUA đường hầm proxy
  → Có thể gãy ở đây: cert hết hạn, TLS version cũ, cipher yếu

Giai đoạn 3: HTTPS request
  Gửi request encrypted qua tunnel → nhận response
  → Có thể gãy ở đây: timeout, server error
```

**Tại sao log từng giai đoạn riêng?**
```
Nếu chỉ log "HTTPS fail":
  → Không biết gãy ở đâu. Proxy lỗi? TLS lỗi? Server lỗi?

Nếu log từng giai đoạn:
  → "CONNECT success" ✓ rồi "TLS fail" ✗
  → Biết ngay: proxy OK, nhưng TLS có vấn đề
  → Sửa đúng chỗ, không phải đoán mò
```

**Đo thêm gì so với HTTP?**
- `tls_handshake_ms` — thời gian TLS handshake
- `tls_version` — TLS 1.2 hay 1.3
- `tls_cipher` — thuật toán mã hóa

**Sau Task 6**: HTTPS goroutine gửi 500 RPM qua CONNECT tunnel, mỗi request log 3 giai đoạn riêng.

---

### Task 7 — Engine (Bộ não điều phối)

**Làm gì**: 3 components quản lý toàn bộ quá trình test.

**Orchestrator** — quản lý 1 proxy, 4 goroutines:
```
Orchestrator nhận 1 proxy → chạy tuần tự:

  Phase 0: Connectivity Check
    → Proxy có sống không? Connect được không?
    → Nếu chết → dừng luôn, báo lỗi

  Phase 1: IP Check (placeholder Sprint 1)
    → GET /ip qua proxy → biết IP proxy

  Phase 2: Warmup (5 requests "nóng máy")
    → Chạy vài request trước để tránh cold-start bias
    → Kết quả warmup KHÔNG tính vào score

  Phase 3: CHẠY 4 goroutines SONG SONG:
    ┌─ Goroutine 1: HTTP Tester    (500 RPM)
    ├─ Goroutine 2: HTTPS Tester   (500 RPM)
    ├─ Goroutine 3: WS Tester      (placeholder Sprint 1, chỉ log "started/stopped")
    └─ Goroutine 4: Rolling Summary (tính điểm mỗi 30 giây)

    → CHẠY LIÊN TỤC cho đến khi user bấm Stop
```

**Scheduler** — quản lý nhiều proxy:
```
Sprint 1: chạy 1 proxy
Sprint 3: chạy 10 proxy song song (10 orchestrators cùng lúc)
```

**Result Collector** — tổng hợp kết quả:
```
Thu thập tất cả http_samples → tính:
  - Uptime ratio: bao nhiêu % success
  - TTFB p50/p95/p99: latency phân vị
  - Jitter: độ dao động
  - Score: điểm tổng hợp
```

**Sau Task 7**: Orchestrator chạy 4 goroutines song song, summary mỗi 30 giây, stop gracefully.

---

### Task 8 — Reporter + Scorer

**Làm gì**: Gửi kết quả từ Runner về API, tính điểm proxy.

**Reporter**:
```
Runner test liên tục → samples tích lũy
Mỗi 50 samples → batch gửi về API: POST /runs/:id/http-samples/batch
Mỗi 30 giây → gửi summary: POST /runs/:id/summary
Nếu API fail → retry 3 lần
```

**Scorer** (Sprint 1 tính 3/5 tiêu chí):
```
Sprint 1:
  score = 0.385 × Uptime + 0.385 × Latency + 0.230 × Jitter

Sprint 3+ (khi có WS + Security):
  score = 0.25 × Uptime + 0.25 × Latency + 0.15 × Jitter + 0.15 × WS + 0.20 × Security
```

> Sprint 1 chưa có WS test và Security check → redistribute weight cho 3 tiêu chí còn lại.

**Sau Task 8**: Kết quả tự chảy từ Runner → API → Database. Score tính được.

---

### Task 9 — Integration Test E2E

**Làm gì**: Chạy toàn bộ luồng từ đầu đến cuối để chắc chắn mọi thứ hoạt động.

```
Bước 1: docker compose up -d → 5 services start
Bước 2: Tạo provider qua API
Bước 3: Tạo proxy qua API (password encrypted)
Bước 4: Tạo run + start → Runner nhận trigger
Bước 5: Chờ 60 giây → verify:
  - http_sample có data (is_https=false + is_https=true)
  - method xoay vòng đủ 6 loại
  - HTTPS có tls_version + tls_handshake_ms
  - warmup samples có is_warmup=true
  - run_summary có score
Bước 6: Stop → verify graceful shutdown
Bước 7: Verify final state: status=completed, totals > 0
```

**20 checks + 20 logging checks** — xem `SPRINT-1-PLAN.md` Task 9 cho đầy đủ.

---

## 3. Logging trong Sprint 1

### Tại sao Sprint 1 đã cần log chi tiết?

Sprint 1 tuy chưa có UI hay WebSocket, nhưng **là nền tảng cho tất cả Sprint sau**. Nếu Sprint 1 log không đúng → Sprint 2, 3, 4 debug rất khó.

### 4 services, mỗi service log khác nhau

| Service | Thư viện log | Base field |
|---------|-------------|------------|
| **Go Runner** | `log/slog` (Go stdlib) | `service: "runner"` |
| **Controller API** | `pino` (Node.js) | `service: "api"` |
| **Target Service** | `pino` (Node.js) | `service: "target"` |
| **Dashboard** | `pino` (Node.js) | `service: "dashboard"` |

### Go Runner — log chi tiết nhất

Runner là trái tim của hệ thống test → cần log chi tiết nhất:

```
Mỗi log entry Runner PHẢI có:
  - service: "runner"
  - module: "proxy.http_tester" / "proxy.https_tester" / "engine.orchestrator" / ...
  - phase: "connectivity" / "warmup" / "continuous" / "stopping" / ...
  - goroutine: "http" / "https" / "ws" / "summary"  (khi ở phase continuous)
  - run_id: UUID của test run
  - proxy_label: tên proxy
```

**HTTP Tester log** — mỗi request:
```
request start → request success/fail → (nếu lỗi: error_type + error_detail)
```

**HTTPS Tester log** — mỗi request 3 giai đoạn:
```
CONNECT tunnel start → success/fail
TLS handshake start → success/fail
HTTPS request sent → response received/fail
HTTPS total timing (breakdown)
```

**Orchestrator log** — theo 7 phases:
```
startup → connectivity (pass/fail) → ip_check → warmup (MỖI request) → continuous → stopping → final_summary
```

### Target Service — phân biệt HTTP vs HTTPS

```
Mỗi log entry Target PHẢI có:
  - server_port: 3001 (HTTP) hoặc 3443 (HTTPS)
  - protocol: "http" hoặc "https"

→ Khi debug: biết request đi vào port nào
```

### Controller API — mỗi request có request_id

```
Mỗi log entry API PHẢI có:
  - request_id: UUID tự generate cho mỗi HTTP request
  - method + path + status_code + duration_ms

→ Khi debug: trace được 1 request từ đầu tới cuối
```

---

## 4. Khi nào coi Sprint 1 hoàn thành?

### 20 verification checks (functional)

Kiểm tra mọi thứ hoạt động: services start, CRUD, test chạy, data vào DB, score tính đúng, graceful stop.

### 20 logging checks (L1-L20)

Kiểm tra log đúng format: mọi phase có log, mỗi goroutine phân biệt, error có đủ fields, password không lộ, Target phân biệt HTTP/HTTPS.

> Chi tiết: xem `SPRINT-1-PLAN.md` → Task 9 → Verification Checklist + Logging Verification Checklist.

---

## 5. Sprint 1 KHÔNG làm gì?

| Feature | Sprint nào | Ghi chú Sprint 1 |
|---------|-----------|-------------------|
| Dashboard UI (form, charts) | Sprint 2 | Chỉ có placeholder Next.js page |
| WebSocket tester (ws + wss) | Sprint 3 | Goroutine 3 TỒN TẠI nhưng chỉ log started/stopped |
| IP check (DNSBL + Geo) | Sprint 3 | Chỉ GET /ip lấy IP, không check blacklist |
| Test song song 10 proxy | Sprint 3 | Sprint 1 test 1 proxy duy nhất |
| Concurrency burst test | Sprint 3 | Code structure sẵn, chưa kích hoạt |
| S_ws + S_security scoring | Sprint 3 | Sprint 1 chỉ 3 tiêu chí: Uptime + Latency + Jitter |
| Charts, comparison, export | Sprint 4 | — |

> Sprint 1 tạo khoảng ~41 files (30 files mới + 11 files sửa).
>
> Sprint 1 xây móng, Sprint 2-4 xây nhà.
