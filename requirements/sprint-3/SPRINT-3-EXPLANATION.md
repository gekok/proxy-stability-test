# Giải thích Sprint 3 — WebSocket + IP Check + Parallel

**Status: DONE** (2026-02-26)

---

## 0. Sprint 3 làm gì?

```
Input:  Sprint 2 hoàn thành — Dashboard UI đầy đủ, CRUD forms, Start/Stop test, Realtime results
Output: Full pipeline — HTTP + HTTPS + WebSocket + IP Check, test song song 10 proxies, scoring 5 tiêu chí
```

Sprint 3 **nâng cấp toàn bộ hệ thống test** từ "test cơ bản HTTP/HTTPS cho 1 proxy" thành "test toàn diện cho nhiều proxy cùng lúc". Giống như nâng cấp phòng khám — Sprint 1 xây phòng khám, Sprint 2 lắp reception desk, Sprint 3 **mở thêm phòng khám chuyên khoa + khám nhiều bệnh nhân cùng lúc**.

**Trước Sprint 3** (Sprint 1+2):
```
1 proxy → test HTTP + HTTPS → chấm điểm 3 tiêu chí → xem trên Dashboard
```

**Sau Sprint 3**:
```
10 proxies → test HTTP + HTTPS + WebSocket + IP Check → chấm điểm 5 tiêu chí → xem tất cả trên Dashboard
                                     ↑              ↑                    ↑
                                  MỚI: WS         MỚI: IP            MỚI: WS + Security
```

**Sau Sprint 3, anh mở Dashboard**:
```
http://localhost:3000
```
→ Chọn 3-10 proxies → bấm Start → **tất cả chạy song song** → xem kết quả realtime cho từng proxy → mỗi proxy có thêm:
- **WS metrics**: kết nối WebSocket ổn không, tin nhắn bị mất bao nhiêu
- **IP check**: proxy có bị blacklist không, quốc gia có đúng không
- **Score breakdown**: 5 tiêu chí thay vì 3

---

## 1. Có gì trong Sprint 3? (9 tasks)

### Nhìn nhanh

```
                ┌──────────────────────────────────────────────────────┐
                │                  Sprint 3 Upgrades                    │
                │                                                      │
                │  ┌────────────────┐  ┌────────────────────────────┐  │
                │  │   Go Runner    │  │        Dashboard           │  │
                │  │                │  │                            │  │
                │  │ WS Tester ★    │  │  WS Connections tab ★     │  │
                │  │ IP Checker ★   │  │  IP Check tab ★           │  │
                │  │ Scheduler ★    │  │  Score Breakdown ★        │  │
                │  │ Burst Test ★   │  │  Multi-proxy display ★   │  │
                │  │ Scoring 5x ★   │  │                            │  │
                │  └────────────────┘  └────────────────────────────┘  │
                │  ┌────────────────┐  ┌────────────────────────────┐  │
                │  │  Target WS ★  │  │     API ws/ip ★            │  │
                │  └────────────────┘  └────────────────────────────┘  │
                │                                                      │
                │  ★ = Sprint 3 upgrade                                │
                └──────────────────────────────────────────────────────┘
```

### 9 Tasks theo thứ tự

| Task | Tên | Làm gì | Tại sao cần |
|------|-----|--------|-------------|
| 1 | Target WS Echo | Nâng cấp WebSocket echo server | Runner cần server WS thật để test |
| 2 | WS Tester | Runner test WebSocket qua proxy | Biết proxy hỗ trợ WS tốt không |
| 3 | IP Checker | Kiểm tra IP blacklist + quốc gia | Biết proxy có sạch và đúng vị trí |
| 4 | Scheduler | Chạy 10 proxies song song | Test nhiều proxy cùng lúc |
| 5 | Burst Test | Test chịu tải đột biến | Biết proxy có bị throttle không |
| 6 | Scoring 5x | Chấm điểm 5 tiêu chí | Đánh giá toàn diện hơn |
| 7 | API ws/ip | Backend hỗ trợ data WS/IP mới | Lưu trữ + truy vấn data mới |
| 8 | Dashboard | Hiển thị WS/IP/Score trên UI | User xem được kết quả mới |
| 9 | E2E Test | Test toàn bộ flow | Chắc chắn mọi thứ hoạt động |

### Thứ tự dependency

```
Task 1 (Target WS Echo)
  ├── Task 2 (WS Tester)        ← làm song song
  └── Task 3 (IP Checker)       ← với Task 2
        └── Task 4 (Scheduler Multi-proxy)
              └── Task 5 (Burst Test)
                    └── Task 6 (Scoring 5 components)
                          └── Task 7 (API ws/ip)
                                └── Task 8 (Dashboard)
                                      └── Task 9 (E2E Test)
```

---

## 2. Giải thích từng Task

### Task 1 — Target Service: WS Echo Full Implementation

**Làm gì**: Nâng cấp WebSocket server trong Target Service từ "nhận 1 tin nhắn rồi thôi" thành "echo mọi tin nhắn, ping/pong, giữ kết nối lâu dài".

**Giống như**: Thiết lập đường dây điện thoại thử nghiệm. Sprint 1 chỉ cắm dây, Sprint 3 đường dây hoạt động đầy đủ — nói gì bên kia lặp lại, mỗi 10 giây hỏi "còn nghe không?", sau N giây tự cúp máy.

**Chi tiết**:
```
Client gửi tin nhắn JSON → Server echo nguyên vẹn về client
Server ping mỗi 10 giây → Client trả pong → biết kết nối còn sống
?hold=60000 → sau 60 giây server cúp máy (Normal Closure)
Chạy trên cả HTTP (:3001) và HTTPS (:3443)
```

**Sau Task 1**: Target Service có WebSocket echo server thật, sẵn sàng cho Runner test.

---

### Task 2 — Go Runner: WS Tester Full Implementation

**Làm gì**: Goroutine WS (trước đây chỉ log "started/stopped") giờ thực sự test WebSocket qua proxy — kết nối, gửi/nhận tin nhắn, đo tốc độ, phát hiện mất tin nhắn.

**Giống như**: Test chất lượng đường dây điện thoại. Gọi qua proxy → nói 60 câu/phút → đếm bao nhiêu câu bên kia nghe được → ghi nhận chất lượng → cúp máy → gọi lại bằng đường dây khác → so sánh.

**ws/wss alternation (xen kẽ)**:
```
Connection 1: ws://  (plain WebSocket, giống HTTP)
Connection 2: wss:// (encrypted WebSocket, giống HTTPS)
Connection 3: ws://
Connection 4: wss://
... xen kẽ liên tục
```

**Tại sao xen kẽ?** So sánh proxy hỗ trợ ws (plain) và wss (encrypted) có khác nhau không. Một số proxy chặn wss hoặc wss chậm hơn nhiều.

**60 tin nhắn/phút** = 1 tin nhắn/giây:
```
Gửi tin nhắn → chờ echo → đo RTT (Round Trip Time)
Không nhận echo trong 5 giây → đếm "drop" (mất tin nhắn)
```

**Ping/pong** — kiểm tra kết nối sống:
```
Mỗi 10 giây gửi ping → đợi pong
3 lần liên tiếp không có pong → kết nối "chết" → ngắt kết nối
```

**Reconnection** — không bao giờ bỏ cuộc:
```
Kết nối fail → thử lại 3 lần (chờ 1s → 2s → 4s)
Hết 3 lần → chờ 10 giây → thử lại từ đầu
Goroutine chỉ dừng khi user bấm Stop
```

**Sau Task 2**: Runner test WebSocket đầy đủ — biết proxy hỗ trợ WS tốt cỡ nào, echo có nhanh không, có mất tin nhắn không.

---

### Task 3 — Go Runner: IP Checker (DNSBL + GeoIP)

**Làm gì**: Kiểm tra IP proxy có bị blacklist không, và IP có đúng quốc gia mong đợi không.

**Giống như**: Kiểm tra "lý lịch" proxy. Proxy hứa IP ở Mỹ → kiểm tra thật sự ở Mỹ không. IP có nằm trong danh sách đen không.

**2 loại kiểm tra**:

| Kiểm tra | Câu hỏi | Nguồn |
|----------|---------|-------|
| DNSBL Blacklist | IP có bị liệt vào danh sách spam không? | 4 servers blacklist quốc tế |
| GeoIP | IP thật sự ở quốc gia nào? | ip-api.com (free) |

**DNSBL là gì?**
```
DNS-based Blackhole List = danh sách IP bị đánh dấu "xấu"
Hỏi 4 servers: Spamhaus, Barracuda, SpamCop, SORBS
→ IP không nằm trong danh sách = "sạch" (Clean)
→ IP nằm trong danh sách = "bẩn" (Listed) → proxy nên tránh dùng
```

**GeoIP là gì?**
```
Proxy hứa: "IP ở Mỹ (US)"
Kiểm tra: ip-api.com → IP thật ở California, US → ✓ Match
Hoặc: ip-api.com → IP thật ở Germany, DE → ✗ Mismatch → proxy nói dối
```

**IP Stability** — mỗi 30 giây kiểm tra:
```
Lần 1: IP = 45.67.89.123 (ghi nhớ)
Lần 2: IP = 45.67.89.123 → ✓ Stable (không đổi)
Lần 3: IP = 45.67.89.200 → ✗ Changed! (IP thay đổi → proxy không ổn định)
```

**Sau Task 3**: Biết proxy "sạch" hay "bẩn", IP có đúng quốc gia, IP có ổn định.

---

### Task 4 — Go Runner: Scheduler Upgrade (Multi-proxy Parallel)

**Làm gì**: Nâng cấp scheduler từ test 1 proxy → test tối đa 10 proxies cùng lúc. Mỗi proxy chạy độc lập — 1 proxy lỗi không ảnh hưởng proxy khác.

**Giống như**: Phòng khám chỉ có 1 bác sĩ → nâng cấp thành 10 bác sĩ khám 10 bệnh nhân song song. 1 bệnh nhân phức tạp không làm chậm 9 bệnh nhân khác.

**Trước Sprint 3**:
```
Start 3 proxies → proxy 1 chạy xong → proxy 2 chạy → proxy 3 chạy
→ Chờ rất lâu
```

**Sau Sprint 3**:
```
Start 3 proxies → proxy 1 + proxy 2 + proxy 3 chạy CÙNG LÚC
→ Nhanh gấp 3
```

**Panic recovery** — bảo vệ hệ thống:
```
Proxy 1: đang chạy bình thường
Proxy 2: BUG → crash (panic) → được "bắt lại" (recovered) → log lỗi
Proxy 3: đang chạy bình thường → KHÔNG bị ảnh hưởng bởi proxy 2 crash
```

**Sau Task 4**: Test 10 proxies song song, proxy lỗi không ảnh hưởng proxy khác.

---

### Task 5 — Go Runner: Concurrency Burst Test

**Làm gì**: Mỗi 5 phút, bắn 100 requests đồng thời vào proxy — xem proxy chịu tải đột biến như thế nào.

**Giống như**: Stress test cho proxy. Bình thường gửi đều đặn, nhưng mỗi 5 phút gửi "bão" requests → proxy có chịu nổi không.

**Tại sao cần burst test?**
```
Bình thường: 500 requests/phút → proxy ổn
Đột biến: 100 requests CÙNG LÚC → proxy có thể:
  ✓ Xử lý hết → tốt
  ✗ Timeout một số → throttle (giới hạn tốc độ)
  ✗ Block tất cả → rate limit (proxy chặn)
```

**Cấu hình**:
```
concurrency_count: 100         ← 100 goroutines gửi đồng thời
concurrency_burst_interval_sec: 300  ← mỗi 300 giây (5 phút)
```

**Sau Task 5**: Biết proxy chịu tải đột biến tốt cỡ nào.

---

### Task 6 — Go Runner: Scoring Upgrade (5 Components)

**Làm gì**: Nâng cấp chấm điểm từ 3 tiêu chí → 5 tiêu chí. Thêm điểm WebSocket và điểm Security.

**Giống như**: Chấm bài từ 3 môn → 5 môn. Sprint 1 chỉ chấm Toán + Lý + Hóa. Sprint 3 thêm Anh Văn + Thể Dục.

**Sprint 1 (3 tiêu chí)**:
```
Score = Uptime(38.5%) + Latency(38.5%) + Jitter(23%)
```

**Sprint 3 (5 tiêu chí)**:
```
Score = Uptime(25%) + Latency(25%) + Jitter(15%) + WS(15%) + Security(20%)
```

**5 tiêu chí chi tiết**:

| Tiêu chí | Trọng số | Đo cái gì | Ví dụ |
|----------|---------|-----------|-------|
| S_uptime | 25% | Proxy hoạt động bao nhiêu % | 99.5% uptime → score cao |
| S_latency | 25% | Tốc độ phản hồi | P95 = 100ms → nhanh, score cao |
| S_jitter | 15% | Độ dao động tốc độ | Dao động ít → ổn định, score cao |
| S_ws | 15% | WebSocket chất lượng | Ít drop, RTT thấp → score cao |
| S_security | 20% | IP sạch + đúng vị trí + ổn định | Clean + Match + Stable → score cao |

**Grade (xếp hạng)**:

| Grade | Điểm | Ý nghĩa |
|-------|------|---------|
| A | ≥ 0.90 | Xuất sắc |
| B | 0.75 – 0.89 | Tốt |
| C | 0.60 – 0.74 | Chấp nhận được |
| D | 0.40 – 0.59 | Kém |
| F | < 0.40 | Rất kém |

**Sau Task 6**: Mỗi proxy được chấm điểm toàn diện 5 tiêu chí, xếp hạng A-F.

---

### Task 7 — Controller API: WS/IP Endpoints Enhancement

**Làm gì**: Backend API hỗ trợ lưu trữ và truy vấn data WS samples, IP checks, và summary mới.

**Giống như**: Kho lưu trữ cần thêm ngăn kéo cho loại data mới. Sprint 1 có ngăn cho HTTP samples, Sprint 3 thêm ngăn cho WS samples và IP check results.

**5 endpoints cần hoàn thiện**:

| Endpoint | Làm gì |
|----------|--------|
| POST /ws-samples/batch | Runner gửi WS results (100/lần) |
| POST /ip-checks | Runner gửi IP check results |
| GET /ws-samples | Dashboard lấy WS data hiển thị |
| GET /ip-checks | Dashboard lấy IP check data hiển thị |
| POST /summary | Runner gửi summary có thêm ws_*/ip_*/score_ws/score_security |

**Sau Task 7**: API sẵn sàng nhận/trả data WS + IP cho Runner và Dashboard.

---

### Task 8 — Dashboard UI: WS/IP Display + Multi-proxy + Score Breakdown

**Làm gì**: Dashboard hiển thị toàn bộ data mới — WS metrics, IP check, score breakdown 5 tiêu chí, multi-proxy view.

**Sprint 2 Run Detail** (4 cards, 1 tab):
```
┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐
│ Score  │ │ P95      │ │ Uptime │ │ Samples│
│  0.85  │ │ 142 ms   │ │ 99.2%  │ │ 1,234  │
└────────┘ └──────────┘ └────────┘ └────────┘

[HTTP Samples]
```

**Sprint 3 Run Detail** (6 cards, 4 tabs):
```
┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Score  │ │ P95      │ │ Uptime │ │ Samples│ │ WS RTT │ │ IP     │
│  0.85  │ │ 142 ms   │ │ 99.2%  │ │ 1,234  │ │ 45 ms  │ │ ✓ Clean│
└────────┘ └──────────┘ └────────┘ └────────┘ └────────┘ └────────┘

[HTTP Samples] [WS Connections] [IP Check] [Score Breakdown]
                     ↑               ↑            ↑
                   MỚI             MỚI          MỚI
```

**Score Breakdown** — xem chi tiết 5 tiêu chí:
```
Score Total: 0.85 (B)
├── Uptime:   ████████████████████████████████████████▌  0.98 (×0.25)
├── Latency:  █████████████████████████████████▌        0.85 (×0.25)
├── Jitter:   ████████████████████████████▊             0.72 (×0.15)
├── WS:       ████████████████████████████████████      0.90 (×0.15)
└── Security: ██████████████████████████████            0.75 (×0.20)
```

**WS Connections tab** — xem từng kết nối WS:

| # | Protocol | Handshake | RTT | Messages | Drops | Held | Disconnect |
|---|----------|-----------|-----|----------|-------|------|------------|
| 1 | ws:// | 45ms | 23ms | 60/60 | 0 | 60s | client_close |
| 2 | wss:// | 120ms | 35ms | 58/60 | 2 | 60s | client_close |

**IP Check tab** — xem kết quả kiểm tra IP:
```
IP: 45.67.89.123    Country: US ✓ Match    Clean: ✓    Stable: ✓
```

**Sau Task 8**: Dashboard hiển thị đầy đủ WS, IP, Score breakdown cho mỗi proxy.

---

### Task 9 — Integration Test E2E

**Làm gì**: Test toàn bộ flow Sprint 3 từ đầu đến cuối — multi-proxy start, WS data, IP check, score breakdown, proxy isolation.

**11 bước test**:
```
1. Khởi động 5 services
2. Tạo 3 providers
3. Tạo 3 proxies (1 per provider)
4. Chọn cả 3 → Start Test
5. Verify 3 runs chạy song song
6. Chờ 2-3 phút → WS data xuất hiện
7. Check WS tab + IP tab có data
8. Check Score Breakdown → 5 components
9. Stop 1 run → 2 run khác vẫn chạy (isolation)
10. Stop hết → all completed
11. Verify final scores + grades
```

**25 functional checks + 10 logging checks** — chi tiết trong `SPRINT-3-PLAN.md` Task 9.

---

## 3. Logging trong Sprint 3

### Tại sao Sprint 3 cần thêm 54 log points?

Sprint 3 thêm nhiều module mới (WS, IP, Scheduler, Burst, Scoring) → mỗi module cần log riêng để debug:
- WS kết nối fail → log ở bước nào (TCP? CONNECT? TLS? Upgrade?)
- IP blacklisted → log server nào liệt kê
- 10 proxies song song → log nào của proxy nào
- Burst test → bao nhiêu success, bao nhiêu fail

### 3 services, phân bổ log

| Service | Sprint 3 logs | Ví dụ |
|---------|--------------|-------|
| **Runner (Go)** | 45 logs | WS tester (26), IP check (8), Scheduler (5), Burst (2), Scoring (4) |
| **Target (Node.js)** | 6 logs | WS Echo server (connection, message, ping/pong, close, error) |
| **Dashboard (Next.js)** | 3 logs | WS tab loaded, IP check loaded, Score breakdown loaded |

### Runner log chi tiết nhất — 45 log points

**WS Tester** — 26 logs (nhiều nhất vì phức tạp nhất):
```
Goroutine lifecycle: started → stopped
Per-connection: start → CONNECT → TLS → Upgrade → Messages → Close
Messages: sent → RTT recorded → drop detected
Ping/pong: sent → received → timeout → 3x dead
Reconnection: retry 1 → retry 2 → retry 3 → exhausted
Cancel: signal → closing active → stopped
```

**IP Check** — 8 logs:
```
Blacklist: start → clean / listed → query fail
GeoIP: lookup done → mismatch → API fail
IP changed (WARN)
```

**Scheduler** — 5 logs:
```
start → proxy goroutine start → proxy goroutine done → panic recovered → all done
```

**Burst** — 2 logs:
```
burst start → burst complete (success_count, fail_count)
```

**Scoring** — 4 logs:
```
score computed → component scores → phase skipped → all metrics null
```

### Tổng Sprint 3: 54 log points mới

| Service | Server | Client | Tổng |
|---------|--------|--------|------|
| Runner | 45 | 0 | 45 |
| Target | 6 | 0 | 6 |
| Dashboard | 0 | 3 | 3 |
| **Tổng** | **51** | **3** | **54** |

> API không cần thêm log — api-client logging từ Sprint 2 (10 events) đã cover mọi API call.

---

## 4. Khi nào coi Sprint 3 hoàn thành?

### 25 verification checks (functional)

Kiểm tra mọi thứ hoạt động qua browser + CLI:
1. Multi-proxy start (3+ proxies song song)
2. WS data hiển thị (ws_samples, RTT, drop rate)
3. IP check hiển thị (clean/listed, geo match, stable)
4. Score 5 components + Grade
5. Proxy isolation (1 stop → others continue)
6. Concurrency burst hoạt động
7. Dashboard tabs (WS, IP, Score Breakdown)
8. Persistence + polling

### 10 logging checks (RL1-RL10)

Kiểm tra log đúng format:
1. WS goroutine started/stopped với đủ fields
2. ws/wss alternation trong Connection start
3. WSS CONNECT + TLS log đầy đủ
4. IP check ran (blacklist + geo)
5. Scheduler multi-proxy (proxy_count)
6. Score 5 components (s_ws + s_security)

> Chi tiết: xem `SPRINT-3-PLAN.md` → Task 9 → Verification Checklist + Logging Verification Checklist.

---

## 5. Sprint 3 KHÔNG làm gì?

| Feature | Sprint nào | Ghi chú Sprint 3 |
|---------|-----------|-------------------|
| Charts (biểu đồ latency/score) | Sprint 4 | Sprint 3 chỉ có số liệu + bảng |
| So sánh nhiều proxy (side-by-side) | Sprint 4 | Sprint 3 xem từng run riêng |
| Export CSV/PDF | Sprint 4 | Chưa implement |
| Import hàng loạt (YAML) | Sprint 4 | Sprint 3 nhập thủ công qua form |
| Alerting (email/Slack khi proxy fail) | Sprint 4 | Chưa implement |
| Long-running report (ngày/tuần) | Sprint 4 | Sprint 3 chỉ có realtime summary |

> Sprint 3 hoàn thiện **testing pipeline** (WS, IP, multi-proxy, scoring). Sprint 4 hoàn thiện **visualization + reporting** (charts, compare, export, alerts).

---

## 6. Tóm lại

Sprint 3 biến hệ thống từ **"test cơ bản 1 proxy"** thành **"test toàn diện 10 proxies song song"**:

1. **WebSocket testing** — test ws + wss xen kẽ, echo 60 msg/phút, ping/pong, reconnection (gorilla/websocket v1.5.3)
2. **IP verification** — blacklist check (4 DNSBL servers) + GeoIP country match (ip-api.com) + IP stability
3. **Multi-proxy parallel** — isolated context per run, proper stop isolation
4. **Burst test** — 100 requests đồng thời mỗi 5 phút, phát hiện throttle/rate limit
5. **Scoring 5 components** — Uptime(25%) + Latency(25%) + Jitter(15%) + WS(15%) + Security(20%), grade A-F, auto weight redistribution
6. **Dashboard upgrade** — 6 summary cards, 4 tabs (HTTP/WS/IP/Score), score breakdown với visual bars
7. **API endpoints** — WS batch insert, IP check insert, paginated GET ws-samples (protocol filter), GET ip-checks
8. **21 files** — Sprint 3: 6 mới + 15 sửa = 21 files

### Implementation verified (2026-02-26)

```
✓ Go build clean (gorilla/websocket v1.5.3)
✓ API TypeScript clean
✓ Target TypeScript clean
✓ Dashboard next build clean (all routes)
✓ Docker: 5 containers healthy
✓ API: POST/GET ws-samples, ip-checks, summary all working
✓ Target WS: connect + echo + hold timer + close code 1000
✓ DB: ws_sample, ip_check_result, run_summary (ws/ip/score fields) populated
```
