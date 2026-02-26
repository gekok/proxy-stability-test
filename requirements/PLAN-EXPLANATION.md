# Giải thích Plan — Proxy Stability Test System

---

## 0. Hệ thống chạy tự động như nào?

```
Bước 1: docker compose up -d          ← chạy 1 lần duy nhất trên máy local
Bước 2: Mở browser → http://localhost:3000
Bước 3: Nhập nhà cung cấp (VD: "BrightData") → Save
Bước 4: Nhập proxy (host, port, user, pass, quốc gia) → Save
         (nhập bao nhiêu cũng được: 1, 3, 5, 10 proxy)
Bước 5: Tick chọn proxies muốn test → bấm "Start Test"
Bước 6: Hệ thống TỰ CHẠY LIÊN TỤC:
         ├── API tạo test run cho mỗi proxy được chọn
         ├── API gọi Runner "hãy test các proxy này"
         ├── Runner test song song tất cả proxy (1000 requests/phút mỗi proxy: 500 HTTP + 500 HTTPS)
         ├── Mỗi proxy chạy 4 goroutines: HTTP, HTTPS, WS, Summary
         ├── HTTP/HTTPS test đầy đủ methods: GET, POST, PUT, PATCH, DELETE, HEAD
         ├── Runner gửi kết quả realtime về API → Dashboard cập nhật liên tục
         ├── Summary tính lại mỗi 30 giây → score cập nhật realtime
         └── CHẠY MÃI cho đến khi anh bấm "Stop Test" hoặc tắt Docker
Bước 7: Xem kết quả REALTIME trên Dashboard (trong khi đang chạy)
Bước 8: Bấm "Stop Test" khi đã đủ data → kết quả cuối lưu vĩnh viễn
```

> Anh KHÔNG cần mở terminal, KHÔNG cần biết YAML, KHÔNG cần gõ lệnh gì sau bước 1.
> Số lượng proxy linh hoạt: test 1 proxy cũng được, 10 proxy cũng được.
> Test chạy liên tục — càng lâu càng chính xác. Dừng khi nào anh muốn.

---

## 1. Tại sao chọn kiến trúc này?

### Tại sao tách Go + Node.js thay vì dùng 1 ngôn ngữ?

Mỗi ngôn ngữ làm đúng thế mạnh của nó:

**Go làm Runner** vì:
- `net/http/httptrace` là tính năng built-in của Go, cho phép đo **chính xác từng mili-giây** ở từng giai đoạn: TCP connect → TLS handshake → nhận byte đầu tiên → hoàn thành. Không ngôn ngữ nào làm điều này dễ như Go
- Goroutines cho phép test **song song 10 proxy cùng lúc** mà không tốn nhiều RAM (1 goroutine chỉ ~2KB, trong khi 1 thread thường ~1MB). 10 proxy × 4 goroutines/proxy = 40 goroutines — Go handle dễ dàng. Tổng: 10,000 HTTP+HTTPS requests/phút
- Compile thành 1 binary duy nhất, chạy ở đâu cũng được, không cần cài dependencies

**Node.js/TypeScript làm API + Dashboard** vì:
- Next.js ecosystem mạnh cho Dashboard UI
- Express/Fastify nhanh cho REST API CRUD
- TypeScript giúp validate data an toàn

**PostgreSQL** vì:
- Cần query phức tạp: tính percentile, so sánh nhiều proxy, filter theo thời gian
- JSONB cho config snapshot — flexible nhưng vẫn query được
- `INET` type cho IP address — built-in validation
- Concurrent writes từ 10 proxy test chạy song song (1000 RPM mỗi proxy) — PG handle tốt

---

## 2. Từng Sprint làm gì và tại sao theo thứ tự đó?

### Tổng quan 4 Sprints

```
Sprint 1: Foundation        → xương sống, chạy được, test được
    ↓
Sprint 2: Dashboard UI      → nhập liệu bằng browser, xem kết quả
    ↓
Sprint 3: WS + IP + Song song → test đầy đủ, so sánh 10 proxy
    ↓
Sprint 4: Charts + Export   → phân tích chuyên sâu, xuất report
```

> Xem chi tiết từng Sprint: `requirements/sprint-N/`

---

### Sprint 1 — Foundation (Nền tảng)

```
Xây: Database + Target Service (HTTP+HTTPS) + Controller API + Go Runner (HTTP riêng + HTTPS riêng)
```

**Tại sao làm trước?** Vì đây là xương sống. Không có cái này thì không test được gì cả.

**9 tasks, theo thứ tự dependency**:
```
Task 1: Project Setup + Docker Compose + Database (7 tables)
Task 2: Target Service (HTTP :3001 + HTTPS :3443)
Task 3: Controller API (CRUD + trigger Runner + nhận kết quả)
Task 4: Go Runner Foundation (HTTP server chờ lệnh, TCP dialer)
Task 5: Go Runner HTTP Tester (plain HTTP, 6 methods, 500 RPM)
Task 6: Go Runner HTTPS Tester (CONNECT tunnel, 6 methods, 500 RPM)
Task 7: Go Runner Engine (orchestrator quản lý 4 goroutines, scheduler, result collector)
Task 8: Go Runner Reporter + Scorer (gửi kết quả về API, tính điểm)
Task 9: Integration Test E2E (chạy toàn bộ luồng từ đầu tới cuối)
```

**Sau Sprint 1, anh có thể**:
- `docker compose up -d` → tất cả services chạy local
- Gọi API để tạo provider + proxy → trigger test → kết quả vào DB
- Biết được proxy có connect được không, latency bao nhiêu, TLS có ổn không
- HTTP goroutine test riêng (GET, POST, PUT, PATCH, DELETE, HEAD) — 500 RPM
- HTTPS goroutine test riêng (cùng 6 methods qua CONNECT tunnel) — 500 RPM
- Mọi thao tác qua API (dùng curl hoặc Postman), chưa có UI

> Chi tiết: `requirements/sprint-1/SPRINT-1-PLAN.md`
> Giải thích: `requirements/sprint-1/SPRINT-1-EXPLANATION.md`

Tất cả chạy local bằng Docker Compose — không cần VPS hay cloud.

---

### Sprint 2 — Dashboard UI (Giao diện nhập liệu + xem kết quả)

```
Xây: Dashboard UI — form nhập proxy, nút Run Test, xem kết quả cơ bản
```

**Tại sao lên Sprint 2?** Vì:
- UI là nơi anh nhập liệu chính (anh không dùng YAML hay terminal)
- Cần có UI sớm để anh bắt đầu test proxy thật ngay
- API đã sẵn từ Sprint 1, UI chỉ cần gọi API

**Sau Sprint 2, anh có thể**:
- Mở browser → nhập provider → nhập proxy (host/port/user/pass)
- Bấm **"Start Test"** → test chạy liên tục → xem score + latency + uptime cập nhật realtime
- Bấm **"Stop Test"** khi đã đủ data → kết quả lưu vĩnh viễn
- Đóng browser → test vẫn chạy, mở lại vẫn thấy kết quả
- Không cần mở terminal, không cần biết YAML

> Chi tiết: `requirements/sprint-2/` (chưa có plan chi tiết)

---

### Sprint 3 — WebSocket + IP Check + Test song song

```
Xây: WS/WSS test + Kiểm tra IP + Test song song nhiều proxy
```

**Tại sao sau Sprint 2?** Vì:
- Cần HTTP/HTTPS test hoạt động ổn trước khi thêm WebSocket
- IP check cần proxy đã connect được
- Song song cần single-proxy test ổn trước

**Sau Sprint 3, anh có thể**:
- Test HTTP + HTTPS + WebSocket **chạy song song** trên cùng 1 proxy (4 goroutines: HTTP, HTTPS, WS, Summary)
- Biết IP proxy có sạch không, có đúng quốc gia không
- Chọn 10 proxy từ 10 nhà cung cấp → bấm 1 nút → tất cả test song song (1000 RPM mỗi proxy = 500 HTTP + 500 HTTPS)

> Chi tiết: `requirements/sprint-3/` (chưa có plan chi tiết)

---

### Sprint 4 — Advanced Dashboard (Charts + So sánh + Export)

```
Xây: Charts chi tiết, so sánh providers, export report
```

**Tại sao cuối cùng?** Vì:
- Cần đủ data (HTTP + WS + IP check) để charts có ý nghĩa
- Comparison cần nhiều runs đã hoàn thành
- Export cần data model đã ổn định

**Sau Sprint 4, anh có thể**:
- Xem charts latency theo thời gian, uptime timeline
- So sánh 10 providers trên 1 trang (radar chart + bảng)
- Export JSON/CSV gửi cho team
- Xem log lỗi chi tiết — biết lỗi ở phase nào, proxy nào, lúc nào

> Chi tiết: `requirements/sprint-4/` (chưa có plan chi tiết)

---

## 3. Hoàn thành xong Plan này, test được những gì?

### 3.1 Khả năng kết nối (Connectivity)

| Test | Đo cái gì | Tại sao quan trọng |
|------|-----------|-------------------|
| TCP connect | Proxy có mở port không, mất bao lâu để connect | Proxy chết = mọi thứ chết |
| Authentication | user/pass có đúng không, có bị reject không | Auth fail = không dùng được |
| CONNECT tunnel | Proxy có hỗ trợ HTTPS tunnel không | Bắt buộc cho HTTPS + WSS |

### 3.2 Hiệu năng (Performance)

| Metric | Ý nghĩa | Ngưỡng tham khảo |
|--------|---------|-------------------|
| **TTFB (Time to First Byte)** | Từ lúc gửi request tới lúc nhận byte đầu tiên | p95 < 200ms là tốt |
| **Total duration** | Tổng thời gian hoàn thành request | Phụ thuộc payload size |
| **TCP connect time** | Thời gian thiết lập kết nối TCP tới proxy | < 50ms nếu cùng region |
| **TLS handshake time** | Thời gian bắt tay TLS qua tunnel | < 100ms là tốt |
| **Jitter** (stddev) | Độ dao động latency | Thấp = ổn định, cao = bất thường |
| **Throughput** (bytes/sec) | Băng thông thực tế qua proxy | Quan trọng nếu truyền data lớn |

**Tất cả đều tính p50 / p95 / p99** — nghĩa là:
- p50: 50% requests nhanh hơn giá trị này (trung vị)
- p95: 95% requests nhanh hơn → phản ánh "trường hợp xấu thường gặp"
- p99: 99% requests nhanh hơn → phản ánh "worst case"

### 3.3 Độ ổn định (Stability / Uptime)

| Test | Đo cái gì |
|------|-----------|
| **Uptime ratio** | Bao nhiêu % requests thành công (target: ≥ 99.9%) |
| **Error rate** | Bao nhiêu % requests fail, phân loại theo error type |
| **IP stability** | IP có thay đổi giữa chừng không (định kỳ check) |
| **WS hold duration** | WebSocket giữ được bao lâu trước khi bị drop |
| **WS disconnect reason** | Proxy tự ngắt hay client ngắt? Timeout hay error? |
| **HTTP + WS song song** | Proxy chịu được vừa HTTP vừa WS cùng lúc không |
| **Concurrency burst** | 100 request cùng lúc có bị drop không |

### 3.4 Bảo mật (Security)

| Test | Đo cái gì | Tại sao |
|------|-----------|---------|
| **IP Blacklist check** | IP có nằm trong DNSBL không (Spamhaus, Barracuda...) | IP bẩn → tài khoản Zalo bị flag ngay |
| **Geo verification** | IP thực tế ở đâu vs expect ở đâu | Login Zalo từ IP US khi account VN → suspicious |
| **TLS version** | TLS 1.2 hay 1.3 | TLS < 1.2 = không an toàn |
| **TLS cipher** | Mã hóa mạnh hay yếu | Cipher yếu = có thể bị sniff |
| **Dedicated vs Shared** | IP chỉ mình dùng hay share với người khác | Shared → người khác spam → mình bị liên đới |
| **IP stability** | IP có đổi giữa session không | Đổi IP giữa chừng → Zalo flag "suspicious login" |

### 3.5 WebSocket (Real-time connection)

| Test | Đo cái gì | Tại sao |
|------|-----------|---------|
| **WS Handshake** | Mất bao lâu để upgrade lên WebSocket | Zalo dùng WebSocket cho real-time messaging |
| **Message RTT** | Round-trip time mỗi message qua proxy | Tin nhắn delay bao lâu |
| **Drop rate** | Bao nhiêu % messages bị mất | Mất tin nhắn = UX tệ |
| **Keep-alive** | Proxy giữ WS connection được bao lâu | Nếu proxy ngắt sau 30s → phải reconnect liên tục |

---

## 4. Scoring tổng hợp — Đánh giá cuối cùng

Sau khi test xong, mỗi proxy được **1 điểm duy nhất (0.0 → 1.0)** dựa trên 5 tiêu chí:

```
score = 0.25 × Uptime
      + 0.25 × Latency
      + 0.15 × Jitter
      + 0.15 × WebSocket
      + 0.20 × Security
```

**Ví dụ so sánh 10 nhà cung cấp** (chạy song song cùng lúc, 1000 RPM mỗi proxy):

| # | Provider | Uptime | Latency | Jitter | WS | Security | **Total** | Grade |
|---|----------|--------|---------|--------|-----|----------|-----------|-------|
| 1 | BrightData | 0.99 | 0.85 | 0.90 | 0.88 | 1.00 | **0.92** | **A** |
| 2 | Oxylabs | 0.97 | 0.80 | 0.85 | 0.82 | 0.95 | **0.88** | **B** |
| 3 | SmartProxy | 0.98 | 0.75 | 0.80 | 0.80 | 0.90 | **0.85** | **B** |
| 4 | IPRoyal | 0.96 | 0.70 | 0.75 | 0.78 | 0.85 | **0.81** | **B** |
| 5 | GeoNode | 0.95 | 0.68 | 0.70 | 0.75 | 0.80 | **0.78** | **B** |
| 6 | SOAX | 0.94 | 0.65 | 0.65 | 0.70 | 0.85 | **0.76** | **B** |
| 7 | Webshare | 0.93 | 0.60 | 0.60 | 0.65 | 0.75 | **0.72** | **C** |
| 8 | StormProxies | 0.91 | 0.55 | 0.55 | 0.60 | 0.70 | **0.67** | **C** |
| 9 | Proxy-Seller | 0.90 | 0.50 | 0.50 | 0.55 | 0.65 | **0.63** | **C** |
| 10 | Infatica | 0.88 | 0.45 | 0.45 | 0.50 | 0.60 | **0.58** | **D** |

→ Kết luận: Top 3 cho use case Zalo = BrightData (A), Oxylabs (B), SmartProxy (B).

---

## 5. Logging — Tại sao quan trọng?

### Logging là gì?

Logging = ghi lại **mọi thứ xảy ra** trong hệ thống dưới dạng text có cấu trúc (JSON). Giống camera an ninh — khi có sự cố, mở log ra là biết chuyện gì xảy ra, ở đâu, lúc nào.

### Hệ thống log như thế nào?

```
Mỗi event → 1 dòng JSON → ghi vào Docker logs

Ví dụ 1 dòng log khi HTTPS request fail:
{
  "timestamp": "2026-02-25T10:30:15Z",     ← khi nào
  "level": "ERROR",                          ← mức độ nghiêm trọng
  "service": "runner",                       ← service nào
  "module": "proxy.https_tester",            ← module nào trong service
  "goroutine": "https",                      ← goroutine nào
  "phase": "continuous",                     ← đang ở giai đoạn nào
  "run_id": "abc-123",                       ← test run nào
  "proxy_label": "BrightData-VN-1",         ← proxy nào
  "method": "POST",                          ← HTTP method nào
  "request_type": "echo",                    ← loại request gì
  "error_type": "timeout",                   ← lỗi gì
  "message": "HTTPS request fail"            ← mô tả
}
```

### Tại sao log chi tiết đến vậy?

**Vì khi lỗi xảy ra, anh cần biết CHÍNH XÁC**:
- Lỗi ở **service nào**? (Runner? API? Target?)
- Lỗi ở **goroutine nào**? (HTTP? HTTPS? WebSocket?)
- Lỗi ở **giai đoạn nào**? (Connect? TLS? Request?)
- Lỗi ở **method nào**? (GET? POST? PUT?)
- Lỗi ở **proxy nào**? (BrightData? Oxylabs?)
- Lỗi ở **loại request nào**? (Echo? Bandwidth test? IP check?)

**Ví dụ thực tế**: HTTPS request fail, nhưng fail ở đâu?

```
Trường hợp 1: CONNECT tunnel fail (proxy từ chối)
  → Log: "CONNECT tunnel fail", proxy_status: 502
  → Kết luận: Lỗi proxy, không phải lỗi hệ thống mình

Trường hợp 2: TLS handshake fail (chứng chỉ hết hạn)
  → Log: "CONNECT tunnel success" ✓ rồi "TLS handshake fail"
  → Kết luận: Proxy OK nhưng target cert có vấn đề

Trường hợp 3: HTTPS request timeout (server chậm)
  → Log: "CONNECT tunnel success" ✓ rồi "TLS handshake success" ✓ rồi "HTTPS request fail"
  → Kết luận: Proxy OK, TLS OK, nhưng request chậm quá timeout
```

Nếu không log từng giai đoạn riêng → chỉ biết "HTTPS fail" mà không biết **gãy ở chỗ nào**.

### 7 giai đoạn (phases) được log riêng

```
Phase 1: startup          ← Runner khởi động, load config
Phase 2: connectivity     ← Check proxy sống không
Phase 3: ip_check         ← Xem IP proxy
Phase 4: warmup           ← Chạy vài request "nóng máy"
Phase 5: continuous       ← CHẠY TEST CHÍNH (4 goroutines)
Phase 6: stopping         ← User bấm Stop, dừng từng goroutine
Phase 7: final_summary    ← Tính điểm cuối cùng
```

Khi có lỗi → filter log theo phase → biết ngay lỗi ở giai đoạn nào:
```bash
# Xem tất cả lỗi ở giai đoạn warmup
docker compose logs | jq 'select(.phase == "warmup" and .level == "ERROR")'

# Xem quá trình stop diễn ra thế nào
docker compose logs | jq 'select(.phase == "stopping")'
```

---

## 6. Tóm lại — Giá trị cuối cùng

Khi hoàn thành plan này, anh sẽ có:

1. **1 CLI tool** (Go binary) — chạy 1 lệnh là test song song 10 proxy từ 10 providers (1000 RPM mỗi proxy)
2. **1 REST API** — quản lý providers, proxies, xem kết quả, export
3. **1 Dashboard** — UI trực quan cho team xem
4. **1 bộ tiêu chí đo lường rõ ràng** — không phải "cảm giác" mà là data cụ thể
5. **Khả năng so sánh 10 nhà cung cấp** — chọn proxy tốt nhất dựa trên số liệu thực
6. **Chạy hoàn toàn local** — Docker Compose, không cần VPS hay cloud
7. **Log chi tiết** — khi lỗi xảy ra, biết chính xác lỗi ở đâu, giai đoạn nào, proxy nào

**Trả lời được câu hỏi**: "Trong 10 nhà cung cấp proxy, ai tốt nhất cho hệ thống Zalo?" — bằng con số, xếp hạng A→F, không bằng phỏng đoán.

---

## Cấu trúc files

```
requirements/
├── PLAN-EXPLANATION.md              ← File này — giải thích plan tổng
├── PROXY-TEST-PLAN.md               ← Plan implementation chi tiết (v1.2)
├── sprint-1/
│   ├── SPRINT-1-PLAN.md             ← Sprint 1 chi tiết — 9 tasks
│   └── SPRINT-1-EXPLANATION.md      ← Giải thích Sprint 1
├── sprint-2/                        ← (chờ plan)
├── sprint-3/                        ← (chờ plan)
└── sprint-4/                        ← (chờ plan)

changelog/
└── CHANGELOG.md                     ← Lịch sử thay đổi plan
```
