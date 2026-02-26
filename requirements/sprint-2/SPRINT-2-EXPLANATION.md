# Giải thích Sprint 2 — Dashboard UI + Basic Flow

---

## 0. Sprint 2 làm gì?

```
Input:  Sprint 1 hoàn thành — 4 services chạy, API CRUD, Runner test proxy qua CLI
Output: Dashboard UI — user nhập Provider/Proxy qua form, Start/Stop test qua nút bấm, xem kết quả realtime
```

Sprint 2 xây **giao diện web** cho toàn bộ hệ thống. Giống xây nhà — Sprint 1 đổ móng xong, Sprint 2 lắp cửa sổ, bàn ghế, hệ thống đèn để ở được.

**Sau Sprint 2, anh mở trình duyệt**:
```
http://localhost:3000
```
→ Dashboard hiện ra → anh nhập nhà cung cấp proxy → nhập proxy → bấm Start Test → xem kết quả realtime → bấm Stop khi muốn dừng.

Không cần biết API endpoint nào, không cần Postman, không cần command line — **mọi thứ qua giao diện**.

---

## 1. Có gì trong Sprint 2? (9 tasks)

### Nhìn nhanh

```
                ┌──────────────────────────────────────────────┐
                │            http://localhost:3000              │
                │                                              │
                │  ┌──────────┐  ┌─────────────────────────┐  │
                │  │ Sidebar  │  │     Main Content         │  │
                │  │          │  │                           │  │
                │  │ Overview │  │  ┌─────────────────────┐  │  │
                │  │ Providers│  │  │  Provider/Proxy     │  │  │
                │  │ Test Runs│  │  │  Management Forms   │  │  │
                │  │          │  │  └─────────────────────┘  │  │
                │  │          │  │  ┌─────────────────────┐  │  │
                │  │          │  │  │  Test Results        │  │  │
                │  │          │  │  │  (Realtime Update)   │  │  │
                │  │          │  │  └─────────────────────┘  │  │
                │  └──────────┘  └─────────────────────────┘  │
                └──────────────────────────────────────────────┘
                              ↕ gọi API mỗi 3-5 giây
                ┌──────────────────────────────────────────────┐
                │              api (:8000)                      │
                │              runner (:9090)                   │
                │              postgres, target                 │
                └──────────────────────────────────────────────┘
```

### 9 Tasks theo thứ tự

| Task | Tên | Làm gì | Tại sao cần |
|------|-----|--------|-------------|
| 1 | Project Setup | Tạo Next.js project, layout sidebar, UI components, Docker | Khung sườn Dashboard |
| 2 | API Client + Hooks | Module gọi API, TypeScript types, React hooks | Kết nối Dashboard ↔ API |
| 3 | Providers Page | Form tạo/sửa/xóa nhà cung cấp proxy | Quản lý providers qua UI |
| 4 | Proxies Management | Form tạo/sửa/xóa proxy (ẩn password) | Quản lý proxies, bảo mật password |
| 5 | Start Test Flow | Chọn proxy → cấu hình → bấm Start | Bắt đầu test qua UI |
| 6 | Runs List | Bảng danh sách test runs, filter, auto-update | Xem tổng quan tests |
| 7 | Run Detail | Trang chi tiết 1 test: score, latency, samples, Stop | Xem realtime + dừng test |
| 8 | Overview Page | Trang chủ: tổng quan providers, proxies, active tests | Nhìn nhanh toàn hệ thống |
| 9 | Integration Test | Test toàn bộ flow qua browser | Chắc chắn mọi thứ hoạt động |

### Thứ tự dependency

```
Task 1 (Setup)
  └── Task 2 (API Client + Hooks)
        ├── Task 3 (Providers)        ← làm song song
        ├── Task 4 (Proxies)          ← với Task 3 + 6
        └── Task 6 (Runs List)        ←
              ├── Task 5 (Start Test)
              └── Task 7 (Run Detail)
                    └── Task 8 (Overview)
                          └── Task 9 (Integration Test)
```

---

## 2. Giải thích từng Task

### Task 1 — Project Setup + Layout + Navigation

**Làm gì**: Tạo Next.js project (framework React), cài Tailwind CSS (styling), tạo layout chung với sidebar bên trái.

**Sidebar có 3 mục**:
| Mục | Đi đến trang | Làm gì |
|-----|-------------|--------|
| Overview | `/` | Trang chủ tổng quan |
| Providers | `/providers` | Quản lý nhà cung cấp + proxy |
| Test Runs | `/runs` | Xem danh sách + chi tiết test |

**UI Components** — các "viên gạch" dùng lại cho mọi trang:

| Component | Dùng để | Ví dụ |
|-----------|---------|-------|
| Button | Nút bấm | "Add Provider", "Start Test", "Stop" |
| Badge | Nhãn trạng thái | Running (xanh), Completed (xanh dương) |
| Card | Thẻ hiển thị số | Score: 0.85, Latency: 142ms |
| Table | Bảng dữ liệu | Danh sách providers, runs |
| Modal | Popup form | Form thêm/sửa provider |
| LoadingSpinner | Đang tải | Xoay tròn khi chờ API |
| ErrorAlert | Báo lỗi | "Cannot connect to API" |
| EmptyState | Không có data | "No providers yet — Add one!" |

**Sau Task 1**: Mở `http://localhost:3000` → thấy layout với sidebar, nhưng chưa có data.

---

### Task 2 — API Client + Types + Hooks

**Làm gì**: Tạo module kết nối Dashboard với API backend.

**Tại sao cần API Client?**
```
Dashboard (trình duyệt)
  → cần lấy danh sách providers → gọi API
  → cần tạo proxy mới → gọi API
  → cần xem kết quả test → gọi API
  → MỌI THỨ qua API
```

API Client là "người phiên dịch" giữa Dashboard và API:
- Gửi request đúng format
- Nhận response, parse JSON
- Xử lý lỗi (API chết, timeout, validation fail)
- Log mọi lần gọi (biết chuyện gì xảy ra)

**Types là gì?**
TypeScript types định nghĩa "data trông như thế nào":
```
Provider = { id, name, website, notes, created_at }
Proxy = { id, label, host, port, protocol, auth_user, ... }
TestRun = { id, status, started_at, ended_at, score, ... }
```
→ Code biết data có field gì → tránh lỗi typo.

**Hooks là gì?**
React hooks "gói" logic lấy data vào 1 function:
```
useProviders() → { providers, createProvider, updateProvider, deleteProvider }
useRuns() → { runs, fetchRuns, hasActiveRuns }
usePolling(fetchFn, { interval: 5000 }) → tự gọi fetchFn mỗi 5 giây
```
→ Component chỉ cần gọi `useProviders()` → tự có data.

**Polling là gì?**
```
Polling = hỏi lại mỗi N giây

Dashboard: "API ơi, test run có gì mới không?" (mỗi 3 giây)
API: "Score thay đổi rồi, đây data mới"
Dashboard: cập nhật màn hình

→ User thấy kết quả thay đổi tự động mà không cần F5
```

Tại sao polling mà không dùng WebSocket?
- Polling đơn giản hơn nhiều
- 10 proxies × polling 3s = hoàn toàn đủ
- Không cần cài thêm thư viện phức tạp

**Sau Task 2**: Dashboard gọi được API, tự cập nhật data mỗi 3-5 giây.

---

### Task 3 — Providers Page

**Làm gì**: Trang quản lý nhà cung cấp proxy (BrightData, Oxylabs, etc.).

**Flow**:
```
/providers → Bảng danh sách providers
  ├── [Add Provider] → Modal form:
  │     Tên: ___________  (bắt buộc)
  │     Website: ________  (tùy chọn)
  │     Notes: __________  (tùy chọn)
  │     [Save]  [Cancel]
  │
  ├── [Edit] → Form pre-filled data cũ → sửa → [Save]
  │
  └── [Delete] → "Xóa BrightData? Sẽ xóa luôn 3 proxies và test runs."
                 [Confirm]  [Cancel]
```

**Tại sao cần providers?**
- Nhóm proxies theo nhà cung cấp
- So sánh quality giữa các providers
- Xóa provider → cascade xóa tất cả proxies + test runs của provider đó

**Sau Task 3**: Tạo/sửa/xóa providers qua form, data lưu vào database.

---

### Task 4 — Proxies Management

**Làm gì**: Tạo/sửa/xóa proxy cho mỗi provider.

**Proxy form fields**:
| Field | Ý nghĩa | Ví dụ |
|-------|---------|-------|
| Label | Tên hiển thị | "BD-US-1" |
| Host | Địa chỉ proxy | "proxy.brightdata.com" |
| Port | Cổng kết nối | 22225 |
| Protocol | Loại proxy | HTTP hoặc SOCKS5 |
| Username | Tài khoản | "user123" |
| Password | Mật khẩu (ẩn) | "●●●●●●" |
| Country | Quốc gia mong đợi | "US" |
| Dedicated | Proxy riêng? | ✓ |

**Password handling — bảo mật quan trọng**:

```
Tạo proxy mới:
  1. User nhập password → ●●●●●● (ẩn)
  2. Gửi lên API → API mã hóa (AES-256) → lưu vào DB
  3. KHÔNG AI thấy password gốc nữa

Sửa proxy:
  1. Form load → ô password TRỐNG
  2. Ghi chú: "Để trống = giữ password cũ"
  3. Muốn đổi → nhập password mới
  4. Không đổi → bỏ trống → password cũ giữ nguyên

Hiển thị:
  1. Bảng chỉ hiện "Yes" / "No" (có auth hay không)
  2. KHÔNG BAO GIỜ hiện password (dù masked)
  3. API KHÔNG BAO GIỜ trả password về Dashboard
```

> **Tại sao nghiêm ngặt vậy?** Proxy password là tiền. Nếu lộ password → ai cũng dùng được proxy → tốn tiền + bị khóa tài khoản.

**Sau Task 4**: Tạo/sửa/xóa proxies, password được bảo vệ an toàn.

---

### Task 5 — Start Test Flow

**Làm gì**: Luồng bắt đầu test: chọn proxy → cấu hình → bấm Start.

**3 bước**:
```
Bước 1: Chọn proxy
  ┌─ BrightData ──────────────────┐
  │  ☑ BD-US-1  (proxy.bd.com:22225, HTTP)
  │  ☐ BD-UK-2  (proxy.bd.com:22226, HTTP)
  └───────────────────────────────┘
  ┌─ Oxylabs ─────────────────────┐
  │  ☑ OX-DE-1  (proxy.ox.io:8080, SOCKS5)
  └───────────────────────────────┘
  Selected: 2 proxies    [Next →]

Bước 2: Cấu hình
  HTTP requests/min:   [500]    ← mặc định, thường không cần đổi
  HTTPS requests/min:  [500]
  Timeout (ms):        [10000]
  Warmup requests:     [5]
  Note: "Để mặc định nếu không chắc chắn"
  [← Back]  [Start Test]

Bước 3: Đang khởi tạo...
  Creating run for BD-US-1... ✓
  Creating run for OX-DE-1... ✓
  Starting tests... ✓
  → Redirecting to results page...
```

**Sau bước 3**:
- 1 proxy → chuyển đến trang chi tiết `/runs/{id}`
- Nhiều proxy → chuyển đến danh sách `/runs?status=running`

**Sau Task 5**: User bấm nút → test bắt đầu chạy.

---

### Task 6 — Runs List Page

**Làm gì**: Bảng danh sách tất cả test runs, filter theo trạng thái, tự cập nhật.

**Bảng hiển thị**:
```
| Proxy    | Provider   | Status     | Score | Latency P95 | Uptime | Samples |
|----------|------------|------------|-------|-------------|--------|---------|
| BD-US-1  | BrightData | ● Running  | 0.87  | 142 ms      | 99.2%  | 1,234   |
| OX-DE-1  | Oxylabs    | ● Stopping | 0.72  | 298 ms      | 95.1%  | 567     |
| BD-UK-2  | BrightData | ✓ Completed| 0.91  | 98 ms       | 99.8%  | 5,678   |
| OX-JP-3  | Oxylabs    | ✗ Failed   | 0.23  | 1200 ms     | 45.2%  | 89      |
```

**Filter tabs**: All | Running | Stopping | Completed | Failed

**Trạng thái màu**:
| Trạng thái | Màu | Hiệu ứng |
|-----------|------|-----------|
| Running | Xanh lá | Nhấp nháy |
| Stopping | Vàng | Nhấp nháy |
| Completed | Xanh dương | Tĩnh |
| Failed | Đỏ | Tĩnh |

**Tự cập nhật**: Khi có test đang chạy → bảng tự load lại mỗi 5 giây → score/latency/samples thay đổi.

**Sau Task 6**: Xem danh sách tests, filter, score cập nhật realtime.

---

### Task 7 — Run Detail Page (phức tạp nhất)

**Làm gì**: Trang chi tiết 1 test run — xem realtime score, latency, samples, và dừng test.

**Layout trang**:
```
┌─────────────────────────────────────────────────────┐
│  ← Back   BD-US-1   ● Running   Duration: 2m 35s   │
│                                        [Stop Test]  │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Score    │ │ P95      │ │ Uptime   │ │ Samples│ │
│  │   0.85   │ │  142 ms  │ │  99.2%   │ │  1,234 │ │
│  │   (B)    │ │          │ │          │ │        │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────────────────┤
│  Percentiles     │ P50    │ P95    │ P99            │
│  TTFB            │ 85 ms  │ 142 ms │ 320 ms         │
│  TLS Handshake   │ 12 ms  │ 25 ms  │ 48 ms          │
├─────────────────────────────────────────────────────┤
│  Protocol   │ Success Rate │ Samples                 │
│  HTTP       │ 99.5%        │ 617                     │
│  HTTPS      │ 98.8%        │ 617                     │
├─────────────────────────────────────────────────────┤
│  Recent Samples  [All] [HTTP] [HTTPS] [Errors]      │
│  #1234 GET  HTTPS 200  142ms  25ms (TLS)  10:30:15  │
│  #1233 POST HTTP  200   85ms    -         10:30:14  │
│  #1232 PUT  HTTPS 200  156ms  28ms (TLS)  10:30:13  │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

**Realtime update**:
- Khi test đang chạy → trang tự cập nhật mỗi 3 giây
- Score/latency/uptime/samples → số liệu thay đổi mỗi 3 giây
- Duration counter → đếm ngược mỗi giây
- Khi test hoàn thành → ngừng cập nhật

**Score color coding**:
| Score | Màu | Grade | Ý nghĩa |
|-------|------|-------|---------|
| ≥ 0.9 | Xanh đậm | A | Xuất sắc |
| ≥ 0.8 | Xanh | B | Tốt |
| ≥ 0.7 | Vàng | C | Chấp nhận được |
| < 0.7 | Đỏ | D | Kém |

**Stop Test**:
```
1. Bấm [Stop Test]
2. Popup: "Dừng test BD-US-1? Đã chạy 2 phút 35 giây."
   [Confirm Stop]  [Cancel]
3. Confirm → trạng thái chuyển:
   ● Running (xanh, nhấp nháy)
   → ● Stopping (vàng, nhấp nháy)
   → ✓ Completed (xanh dương, tĩnh)
```

**Sau Task 7**: Xem kết quả chi tiết realtime, dừng test khi muốn.

---

### Task 8 — Overview Page (Trang chủ)

**Làm gì**: Trang đầu tiên user thấy khi mở Dashboard — tổng quan toàn hệ thống.

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│  Overview                                            │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Providers│  │ Proxies  │  │ Active Tests     │  │
│  │     3    │  │     8    │  │     2 ●          │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                      │
│  Active Tests                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ BD-US-1  ● Running  Score: 0.85  2m 35s    │    │
│  │ OX-DE-1  ● Running  Score: 0.72  1m 12s    │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  Recent Results                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ BD-UK-2  ✓ Completed  Score: 0.91  5m ago  │    │
│  │ OX-JP-3  ✗ Failed     Score: 0.23  1h ago  │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**Tự cập nhật**: Khi có test đang chạy → trang tự load lại mỗi 5 giây.

**Sau Task 8**: Mở Dashboard → thấy ngay tổng quan hệ thống.

---

### Task 9 — Integration Test E2E

**Làm gì**: Test toàn bộ flow từ đầu đến cuối qua browser.

```
Bước 1: docker compose up -d → 5 services chạy
Bước 2: Mở http://localhost:3000 → Dashboard hiện ra
Bước 3: Tạo provider "BrightData"
Bước 4: Tạo proxy (nhập password) → password ẩn
Bước 5: Start Test → test chạy
Bước 6: Chờ 30 giây → score/latency/uptime xuất hiện
Bước 7: Stop Test → trạng thái chuyển hoàn tất
Bước 8: Đóng browser → mở lại → data vẫn còn
Bước 9: Start test mới → đóng browser → mở lại → test vẫn chạy
```

**20 functional checks + 20 logging checks** — chi tiết trong `SPRINT-2-PLAN.md` Task 9.

---

## 3. Logging trong Sprint 2

### Tại sao Sprint 2 cần log?

Dashboard là **giao diện chính** — nếu có lỗi mà không có log → không biết lỗi ở đâu:
- API gọi fail → lỗi ở Dashboard hay API?
- Proxy tạo fail → validation lỗi hay DB lỗi?
- Test start fail → tạo run fail hay trigger fail?

### 2 loại log

| Loại | Dùng ở | Thư viện | Xem ở đâu |
|------|--------|---------|-----------|
| Server-side | Server (Node.js) | pino (JSON) | `docker compose logs dashboard` |
| Client-side | Trình duyệt | console.* | DevTools (F12) → Console |

### Server-side logs (34 logs)

**API Client** — mỗi lần Dashboard gọi API:
```json
{"level":"debug","service":"dashboard","module":"api-client","msg":"API call start","method":"GET","endpoint":"/providers"}
{"level":"debug","service":"dashboard","module":"api-client","msg":"API call success","method":"GET","endpoint":"/providers","duration_ms":45,"status_code":200}
```

Khi lỗi:
```json
{"level":"warn","msg":"API client error (4xx)","status_code":400,"error_detail":"Name already exists"}
{"level":"error","msg":"API server error (5xx)","status_code":500,"error_detail":"Internal server error"}
{"level":"error","msg":"API connection refused","api_url":"http://localhost:8000","error_detail":"ECONNREFUSED"}
{"level":"error","msg":"API timeout","timeout_ms":10000,"endpoint":"/runs"}
```

> Tách lỗi 4xx (WARN — lỗi từ user) vs 5xx (ERROR — lỗi từ server) → biết ai sai.
> Tách timeout vs connection refused → biết API chậm hay API chết.

**CRUD operations** — mỗi lần tạo/sửa/xóa:
```json
{"level":"info","msg":"Provider created","provider_name":"BrightData"}
{"level":"info","msg":"Proxy updated","proxy_id":"abc-123","password_changed":false}
{"level":"info","msg":"Test started","run_ids":["xyz-456"],"proxy_count":1,"started_by":"user"}
{"level":"info","msg":"Test stopped","run_id":"xyz-456","running_for_ms":155000}
```

> `password_changed: true/false` — chỉ biết CÓ đổi password hay không. KHÔNG BAO GIỜ log password.

### Client-side logs (15 logs, chỉ hiện trong DevTools)

```
[poll] started   { interval: 3000, source: "RunDetailPage" }
[poll] success   { interval: 3000 }
[poll] fail      { error: "Connection refused" }
[poll] cleanup   { reason: "unmount" }
Run status changed { run_id: "xyz", old_status: "running", new_status: "stopping" }
First summary received { run_id: "xyz", score_total: 0.85 }
```

> Client logs chỉ hiện trong development. Production không có → không ảnh hưởng performance.

### Tổng kết: 49 log points

| Ở đâu | Số lượng | Ví dụ |
|--------|---------|-------|
| Server (pino) | 34 | Startup, API calls, CRUD, Start/Stop, Page errors |
| Client (console) | 15 | Polling, status change, form validation, partial fetch |
| **Tổng** | **49** | |

> Sprint 2 tạo khoảng ~35 files.

---

## 4. Khi nào coi Sprint 2 hoàn thành?

### 20 verification checks (functional)

Kiểm tra mọi thứ hoạt động qua browser:
1. Dashboard loads
2. Provider CRUD (tạo/sửa/xóa)
3. Proxy CRUD (password ẩn)
4. Start/Stop test
5. Realtime updates
6. Persistence (đóng/mở browser)
7. Empty states + error handling

### 20 logging checks (DL1-DL20)

Kiểm tra log đúng format:
- API client log mọi call (success + fail)
- CRUD operations log với đúng fields
- Password không xuất hiện trong log
- Client console có polling logs

> Chi tiết: xem `SPRINT-2-PLAN.md` → Task 9 → Verification Checklist + Logging Verification Checklist.

---

## 5. Sprint 2 KHÔNG làm gì?

| Feature | Sprint nào | Ghi chú Sprint 2 |
|---------|-----------|-------------------|
| WebSocket test hiển thị | Sprint 3 | Chưa có WS data (Sprint 3 mới test WS) |
| IP check hiển thị | Sprint 3 | Chưa có IP check data |
| So sánh nhiều proxy | Sprint 4 | Sprint 2 xem từng run riêng |
| Charts (biểu đồ) | Sprint 4 | Sprint 2 chỉ có số liệu + bảng |
| Export CSV/PDF | Sprint 4 | Chưa implement |
| Import hàng loạt (YAML) | Sprint 4 | Sprint 2 nhập thủ công qua form |

> Sprint 2 xây xong giao diện cơ bản. Sprint 3 thêm data mới (WS, IP), Sprint 4 thêm visualization (charts, export).

---

## 6. Tóm lại

Sprint 2 biến hệ thống từ **"chạy được qua command line"** thành **"dùng được qua browser"**:

1. **Dashboard UI** — giao diện web đẹp, dễ dùng
2. **Form nhập liệu** — tạo provider, proxy không cần biết API
3. **Start/Stop qua nút bấm** — không cần Postman
4. **Kết quả realtime** — score/latency cập nhật tự động mỗi 3 giây
5. **Password bảo mật** — mã hóa, ẩn, không bao giờ lộ
6. **Log chi tiết** — 49 log points, biết chính xác lỗi ở đâu
7. **Persistence** — đóng browser, test vẫn chạy, data vẫn còn
