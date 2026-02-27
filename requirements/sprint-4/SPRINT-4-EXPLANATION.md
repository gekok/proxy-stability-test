# Giải thích Sprint 4 — Advanced Dashboard + Export

> **Status: DONE** (2026-02-27) — All 11 tasks implemented + 6 post-implementation bugs fixed.

---

## 0. Sprint 4 làm gì?

```
Input:  Sprint 3 hoàn thành — Full pipeline HTTP+HTTPS+WS+IP, test 10 proxies song song, scoring 5 tiêu chí
Output: UI hoàn chỉnh — Charts interactive + So sánh providers + Export JSON/CSV + Xem log lỗi chi tiết
```

Sprint 4 là **sprint cuối cùng**, hoàn thiện **phần hiển thị và báo cáo**. Giống như xây nhà — Sprint 1 đổ móng + xây tường, Sprint 2 lắp cửa + sơn, Sprint 3 lắp điện + nước đầy đủ, Sprint 4 **trang trí nội thất + lắp bảng điều khiển thông minh**.

**Trước Sprint 4** (Sprint 1+2+3):
```
Kết quả test hiển thị dạng:
┌──────────────────────────────────┐
│ Score: 0.85 (B)                  │
│ P95: 142ms    Uptime: 99.2%     │
│ WS RTT: 45ms  IP: ✓ Clean       │
│                                  │
│ [Bảng số liệu HTTP samples]     │
│ [Bảng số liệu WS connections]   │
│                                  │
│ → CHỈ CÓ SỐ + BẢNG             │
│ → Không có biểu đồ              │
│ → Không so sánh được providers   │
│ → Không export được              │
│ → Lỗi chỉ thấy "error_count"    │
└──────────────────────────────────┘
```

**Sau Sprint 4**:
```
Kết quả test hiển thị dạng:
┌──────────────────────────────────────────────┐
│ ┌─────────┐  Score: 0.85 (B)                │
│ │  ████   │  [↓ Export ▾] [JSON] [CSV]       │
│ │  0.85   │                                  │
│ │   B     │                                  │
│ └─────────┘                                  │
│                                              │
│ ┌── Latency Chart ─────────────────────────┐ │
│ │ ms  ╱╲   P99                             │ │
│ │ 200├╱  ╲──╱╲                             │ │
│ │    │      ╲╱  P95                        │ │
│ │ 100├───────────────  P50                 │ │
│ │    └──┬──┬──┬──┬──┬──→ time             │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌── Uptime Timeline ───────────────────────┐ │
│ │ ████████████████████████████ success      │ │
│ │ ▓▓▓ errors                               │ │
│ │ ── uptime %                              │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [Charts] [HTTP] [WS] [IP] [Score] [Errors🔴]│
│                                              │
│ → CHARTS interactive (zoom, hover tooltip)   │
│ → EXPORT JSON/CSV 1 click                    │
│ → SO SÁNH providers (radar chart)            │
│ → XEM LỖI chi tiết từng error               │
└──────────────────────────────────────────────┘

Compare Page (/compare):
┌──────────────────────────────────────────────┐
│  Select: [BrightData ✓] [Oxylabs ✓] [Smart] │
│  [Compare]                                    │
│                                              │
│        Uptime                                │
│         ╱╲                                   │
│   Sec ╱    ╲ Latency   ── BrightData        │
│      ╱  ╲  ╱           ── Oxylabs           │
│   WS  ──── Jitter                           │
│                                              │
│  ┌──────────┬────────────┬──────────┐       │
│  │ Metric   │ BrightData │ Oxylabs  │       │
│  │ Score    │ 0.87 (B)   │ 0.72 (C) │       │
│  │ Uptime   │ 99.5%      │ 97.2%    │       │
│  │ P95      │ 120ms      │ 230ms    │       │
│  └──────────┴────────────┴──────────┘       │
└──────────────────────────────────────────────┘
```

**Sau Sprint 4, hệ thống HOÀN CHỈNH** — anh có thể:
1. Xem **biểu đồ** latency/uptime/score realtime
2. **So sánh** 2-5 nhà cung cấp proxy bằng radar chart
3. **Tải về** báo cáo JSON/CSV
4. **Xem chi tiết** từng lỗi của mỗi run
5. Dashboard đầy đủ mọi tính năng cần thiết

---

## 1. Có gì trong Sprint 4? (11 tasks)

### Nhìn nhanh

```
                ┌──────────────────────────────────────────────────────┐
                │                  Sprint 4 Features                    │
                │                                                      │
                │  ┌────────────────┐  ┌────────────────────────────┐  │
                │  │   Dashboard    │  │     API Server              │  │
                │  │   Charts       │  │                            │  │
                │  │                │  │  Export endpoint ★         │  │
                │  │ LatencyChart ★ │  │  Compare endpoint ★       │  │
                │  │ UptimeChart ★  │  │                            │  │
                │  │ ScoreGauge ★   │  └────────────────────────────┘  │
                │  │ ScoreHistory ★ │                                  │
                │  │                │  ┌────────────────────────────┐  │
                │  │ Compare page ★ │  │     New npm package         │  │
                │  │ RadarChart ★   │  │  recharts ★                │  │
                │  │ Export btn ★   │  └────────────────────────────┘  │
                │  │ Error viewer ★ │                                  │
                │  └────────────────┘                                  │
                │                                                      │
                │  ★ = Sprint 4 new                                    │
                │                                                      │
                │  ┌────────────────┐  ┌────────────────────────────┐  │
                │  │  Go Runner     │  │     Database                │  │
                │  │  Scoring ★     │  │                            │  │
                │  │                │  │  002_scoring_improvements ★│  │
                │  │ IP re-check ★  │  │  (3 new columns)          │  │
                │  │ IP gradient ★  │  └────────────────────────────┘  │
                │  │ TLS scoring ★  │                                  │
                │  │ Config ★       │                                  │
                │  └────────────────┘                                  │
                └──────────────────────────────────────────────────────┘
```

### 11 Tasks theo thứ tự

| Task | Tên | Làm gì | Tại sao cần |
|------|-----|--------|-------------|
| 1 | Chart Library Setup | Cài thư viện vẽ biểu đồ + components chung | Nền tảng cho tất cả charts |
| 2 | LatencyChart + UptimeTimeline | Biểu đồ tốc độ + biểu đồ uptime | Xem xu hướng tốc độ và ổn định |
| 3 | ScoreGauge + Score History | Đồng hồ điểm + biểu đồ điểm theo thời gian | Xem điểm tổng + lịch sử |
| 4 | API Export + Compare | Backend hỗ trợ xuất file + so sánh | Data cho export + compare |
| 5 | Comparison Page | Trang so sánh providers với radar chart | So sánh nhanh nhiều nhà cung cấp |
| 6 | Export Download | Nút tải về JSON/CSV | Lưu kết quả về máy |
| 7 | Error Log Viewer | Xem chi tiết từng lỗi | Debug lỗi dễ hơn |
| 9 | Scoring Engine Improvements | Nâng cấp công thức chấm điểm | IP re-check, gradient IP, TLS version, config thresholds |
| 10 | Scoring Config — API + Dashboard | Kết nối scoring mới vào hệ thống | DB migration + API wiring + Dashboard UI |
| 11 | E2E Test | Test toàn bộ flow + scoring | Chắc chắn mọi thứ hoạt động |

### Thứ tự dependency

```
Track A — Charts:
Task 1 (Chart Library)
  ├── Task 2 (Latency + Uptime charts)
  ├── Task 3 (ScoreGauge + History)
  └── Task 5 (Comparison Page) ← cần cả Task 1 + Task 4

Track B — Export + Compare:
Task 4 (API Export + Compare)
  ├── Task 5 (Comparison Page)
  └── Task 6 (Export Download)

Track C — Error Viewer:
Task 7 (Error Log Viewer) ← độc lập

Track D — Scoring Improvements:
Task 9 (Scoring Engine — Go Runner) ← độc lập
  └── Task 10 (Scoring Config — API + Dashboard) ← phụ thuộc Task 9

Task 11 (E2E Test) ← chờ tất cả tasks trên xong
```

> Task 1, 4, 7, 9 có thể làm **song song** vì không phụ thuộc nhau.
> Task 10 phụ thuộc Task 9 (scoring engine phải implement trước khi wire API + Dashboard).
> Task 11 (E2E test) phải chờ tất cả tasks khác hoàn thành.

---

## 2. Giải thích từng Task

### Task 1 — Chart Library Setup + Shared Utilities

**Làm gì**: Cài thư viện `recharts` (vẽ biểu đồ) và tạo các components dùng chung cho tất cả charts.

**Giống như**: Mua hộp bút màu + giấy vẽ trước khi vẽ biểu đồ. Tất cả các biểu đồ trong Sprint 4 đều dùng chung hộp bút này.

**Chi tiết**:
```
recharts = thư viện vẽ biểu đồ phổ biến nhất cho React
  → Line chart (biểu đồ đường): cho latency, score
  → Area chart (biểu đồ vùng): cho uptime
  → Radar chart (biểu đồ mạng nhện): cho so sánh
  → Radial chart (biểu đồ tròn): cho score gauge

ChartContainer = khung chứa biểu đồ (tự co giãn theo màn hình)
  → loading: hiện spinner
  → empty: hiện "No data"
  → responsive: tự adjust kích thước

chart-utils = bộ công cụ:
  → Bảng màu (P50=xanh, P95=vàng, P99=đỏ, ...)
  → Format số: 142.5ms, 99.2%, 0.85
  → Màu theo grade: A=xanh lá, B=xanh dương, C=vàng, D=cam, F=đỏ
```

**Sau Task 1**: Có thư viện + components chung, sẵn sàng vẽ biểu đồ.

---

### Task 2 — LatencyChart + UptimeTimeline

**Làm gì**: Vẽ 2 biểu đồ — biểu đồ đường latency (P50/P95/P99) và biểu đồ vùng uptime (success/error + tỷ lệ uptime).

**Giống như**: Máy đo nhịp tim (ECG) — hiển thị liên tục theo thời gian. LatencyChart = đường tốc độ, UptimeTimeline = đường ổn định.

**LatencyChart** — 3 đường P50/P95/P99:
```
ms
250│          ╱╲
200│    ╱╲  ╱  ╲─── P99 (đỏ) — 1% chậm nhất
150│  ╱  ╲╱    ╲╱╲
100│─╱───────────── P95 (vàng) — 5% chậm nhất
 50│──────────────── P50 (xanh) — trung bình
   └──┬──┬──┬──┬──→ time
```

**Tại sao 3 đường?**
- **P50**: Tốc độ "bình thường" — 50% requests nhanh hơn giá trị này
- **P95**: Tốc độ "xấu nhất thường gặp" — chỉ 5% requests chậm hơn
- **P99**: Tốc độ "cực kỳ chậm" — 1% requests tệ nhất

→ P95 và P99 **xa nhau** = proxy không ổn định (đôi khi rất chậm)
→ 3 đường **sát nhau** = proxy ổn định (tốc độ đều đặn)

**UptimeTimeline** — vùng xanh/đỏ + đường uptime %:
```
count
 50│ ████████████████████████████ success (xanh)
 10│ ▓▓▓▓ errors (đỏ)
   │
 % │ ───────────────── uptime 95% (đường tím)
   └──┬──┬──┬──┬──→ time
```

**Sau Task 2**: Xem được biểu đồ latency + uptime realtime trong Run Detail.

---

### Task 3 — ScoreGauge + Score History

**Làm gì**: Tạo đồng hồ tốc độ xe (gauge) hiển thị điểm tổng + grade, và biểu đồ điểm theo thời gian.

**Giống như**:
- **ScoreGauge** = đồng hồ tốc độ xe — kim chỉ điểm hiện tại, màu thay đổi theo mức (xanh=tốt, đỏ=kém)
- **ScoreHistoryChart** = bảng điểm qua các kỳ thi — xem điểm tăng hay giảm theo thời gian

**ScoreGauge**:
```
      ╭──────────╮
    ╱   ████████   ╲     ← vòng cung tô màu (0-100%)
   │    ████████    │
   │                │
   │      85        │     ← điểm số giữa
   │       B        │     ← grade giữa
   │                │
    ╲              ╱
      ╰──────────╯

Màu thay đổi theo grade:
  A (≥90): xanh lá    B (75-89): xanh dương
  C (60-74): vàng     D (40-59): cam       F (<40): đỏ
```

**ScoreHistoryChart** — điểm thay đổi qua thời gian:
```
score
1.0│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░  Grade A zone (xanh nhạt)
0.9│──────────────────────────────
   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░  Grade B zone
0.75│─────────────────────────────
   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░  Grade C zone
0.6│──────────────────────────────
   │    ╱╲  ╱──── score line
   │  ╱   ╲╱
   └──┬──┬──┬──┬──→ time
```

**useSummaryHistory** — ghi nhớ điểm số:
```
Mỗi 30 giây Runner gửi summary mới → Dashboard nhận
→ Hook ghi nhớ điểm (tối đa 200 điểm gần nhất)
→ Chart vẽ đường từ 200 điểm này
→ Xem xu hướng: điểm đang tăng hay giảm
```

**Sau Task 3**: Xem đồng hồ điểm + lịch sử điểm trong Dashboard.

---

### Task 4 — API Export + Compare

**Làm gì**: Tạo 2 API endpoints mới — 1 cho xuất file (export), 1 cho so sánh providers (compare).

**Giống như**:
- **Export endpoint** = phòng hồ sơ bệnh viện — muốn lấy hồ sơ bệnh nhân ra ngoài (file JSON hoặc CSV)
- **Compare endpoint** = phòng so sánh sản phẩm — đưa 2-5 nhà cung cấp vào, lấy ra bảng so sánh

**Export** — 2 format:
```
JSON export = file đầy đủ mọi data:
{
  meta: { run_id, proxy, provider, thời gian, ... },
  summary: { score, uptime, latency, ... },
  scoring: { 5 components + grade },
  http_samples: [ ... tất cả samples ],
  ws_samples: [ ... tất cả WS connections ],
  ip_checks: [ ... tất cả IP checks ]
}

CSV export = file bảng tính (mở được bằng Excel):
seq, method, is_https, target_url, status_code, ttfb_ms, total_ms, ...
1, GET, false, http://target/echo, 200, 45.2, 52.1, ...
2, POST, false, http://target/echo, 200, 48.7, 55.3, ...
```

**Compare** — so sánh providers:
```
GET /providers/compare?provider_ids=brightdata,oxylabs

→ Server tính trung bình từ tất cả runs của mỗi provider:
  BrightData: avg score 0.87, uptime 99.5%, P95 120ms
  Oxylabs:    avg score 0.72, uptime 97.2%, P95 230ms
```

**Sau Task 4**: Backend sẵn sàng cung cấp data cho export và compare features.

---

### Task 5 — Comparison Page (Radar Chart)

**Làm gì**: Tạo trang /compare — chọn 2-5 nhà cung cấp → radar chart so sánh 5 tiêu chí + bảng chi tiết.

**Giống như**: Bảng so sánh sản phẩm trên trang mua hàng (Tiki, Lazada) — chọn 2-3 sản phẩm → xem bảng so sánh specs side-by-side. Radar chart giống biểu đồ "mạng nhện" trong game RPG — mỗi trục là 1 tiêu chí, nhà cung cấp nào phủ diện tích lớn hơn = tốt hơn.

**Radar chart — 5 trục**:
```
         Uptime
          ╱╲
    Sec ╱ ·· ╲ Latency
       ╱ ·    ·╲
      ╱·   ╲   ·╲
   WS ·─── · ───· Jitter
       ·       ·
        ·     ·
         · · ·

  ── BrightData (xanh dương) — diện tích lớn = tốt hơn
  ·· Oxylabs (đỏ) — diện tích nhỏ hơn
```

**Bảng so sánh** — side-by-side:
```
┌──────────────┬────────────┬──────────┐
│ Metric       │ BrightData │ Oxylabs  │
├──────────────┼────────────┼──────────┤
│ Overall Score│ 0.87 (B)   │ 0.72 (C) │
│ Uptime %     │ 99.5%      │ 97.2%    │
│ Latency P95  │ 120ms      │ 230ms    │
│ WS RTT       │ 35ms       │ 67ms     │
│ IP Clean     │ 100%       │ 75%      │
│ Geo Match    │ 100%       │ 100%     │
│ Total Runs   │ 5          │ 3        │
└──────────────┴────────────┴──────────┘
```

**Sau Task 5**: Anh vào /compare, chọn providers, xem ai tốt hơn trong nháy mắt.

---

### Task 6 — Export Feature (Download)

**Làm gì**: Tạo nút "Tải về" (Export) trên Dashboard — dropdown chọn JSON hoặc CSV → file tải về máy.

**Giống như**: Nút "Download" bất kỳ — click → chọn format → file tải về. Spinner quay khi đang tải.

**Flow**:
```
User nhìn Run Detail → thấy nút [↓ Export ▾]
  → Click → Dropdown: [JSON] [CSV]
  → Chọn JSON → spinner quay → file "run-abc12345.json" tải về
  → Chọn CSV → spinner quay → file "run-abc12345.csv" tải về
```

**Khi nào nút bị disabled?**
```
Run status = pending → nút Export bị mờ (chưa có data)
Run status = running → Export được (data hiện tại)
Run status = completed → Export được (data cuối cùng)
```

**Sau Task 6**: Anh tải về file báo cáo JSON/CSV từ Dashboard.

---

### Task 7 — Error Log Viewer

**Làm gì**: Tạo tab "Errors" trong Run Detail — hiển thị danh sách tất cả lỗi từ HTTP + WS + IP, có thể lọc và xem chi tiết.

**Giống như**: Sổ ghi lỗi chi tiết — thay vì chỉ biết "có 15 lỗi", giờ xem được từng lỗi: lỗi gì, lúc nào, ở đâu, chi tiết ra sao.

**Trước Sprint 4**:
```
Errors: 15     ← chỉ biết có 15 lỗi, không biết gì thêm
```

**Sau Sprint 4**:
```
Errors (15) 🔴    ← badge đỏ cho biết số lỗi

┌──────────────────────────────────────────────────────┐
│ Filter: [All Sources ▾] [All Types ▾] [All Proto ▾]  │
│                                                      │
│ [HTTP] timeout          https   GET   14:23:05  ▶   │
│ [HTTP] connection_refused http  POST  14:22:48  ▶   │
│ [WS]   ws_upgrade_failed  wss        14:22:30  ▶   │
│ [IP]   ip_blacklisted                14:20:00  ▶   │
│                                                      │
│ ▼ [HTTP] timeout          https   GET   14:23:05    │
│   Message: request timed out after 10000ms           │
│   URL: https://target:3443/echo                      │
│   TCP: 45ms  TLS: 120ms  TTFB: —  Total: 10000ms   │
│   Seq: #847                                          │
└──────────────────────────────────────────────────────┘
```

**Màu theo nguồn**:
```
[HTTP] = xanh dương    [WS] = tím    [IP] = vàng cam
```

**Filter** — lọc lỗi:
```
Source: All | HTTP | WS | IP
Error type: All | timeout | connection_refused | ws_upgrade_failed | ...
Protocol: All | HTTP | HTTPS | WS | WSS
```

**Sau Task 7**: Anh xem được chi tiết từng lỗi, lọc theo loại, debug dễ hơn nhiều.

---

### Task 9 — Scoring Engine Improvements (Go Runner)

**Làm gì**: Nâng cấp công thức chấm điểm trong Go Runner — 4 cải tiến quan trọng.

**Giống như**: Nâng cấp bộ tiêu chí chấm bài thi — trước đây chấm đơn giản (đúng/sai), giờ chấm chi tiết hơn (đúng bao nhiêu %, dùng phương pháp nào).

**4 cải tiến**:
```
1. IP Stability Re-check (quan trọng nhất):
   Trước: Kiểm tra IP 1 lần đầu run → coi là "ổn định" suốt
   Sau:   Kiểm tra IP mỗi 60 giây → phát hiện IP đổi giữa chừng
   → Giống kiểm tra nhân viên chỉ 1 lần lúc tuyển vs. giám sát liên tục

2. IP Clean Gradient (chi tiết hơn):
   Trước: Bị blacklist 1/4 server → 0 điểm (giống bị blacklist 4/4)
   Sau:   Bị blacklist 1/4 server → 0.75 điểm (tỷ lệ)
   → Giống chấm thi: trước đây sai 1 câu = trượt, giờ tính điểm tỷ lệ

3. TLS Version Scoring (phân biệt TLS 1.2 vs 1.3):
   Trước: Có HTTPS = 1.0, không có = 0.0
   Sau:   TLS 1.3 = 1.0, TLS 1.2 = 0.7, khác = 0.0
   → TLS 1.3 mới hơn, nhanh hơn, an toàn hơn → điểm cao hơn

4. Configurable Thresholds:
   Trước: Mốc latency 500ms cố định
   Sau:   User tùy chỉnh: "tôi chấp nhận latency 300ms" → điểm tính theo mốc 300ms
   → Giống chỉnh điểm đỗ: trước 5.0 cố định, giờ user chọn mốc
```

**Sau Task 9**: Scoring engine thông minh hơn, kết quả chính xác hơn.

---

### Task 10 — Scoring Config — API + Dashboard Integration

**Làm gì**: Kết nối scoring engine mới (Task 9) vào toàn bộ hệ thống — DB lưu trữ, API truyền config, Dashboard hiển thị.

**Giống như**: Sau khi nâng cấp bộ chấm điểm, cần: (1) sổ điểm mới ghi thêm cột, (2) phòng thi truyền tiêu chí mới cho giám thị, (3) bảng kết quả hiển thị điểm chi tiết hơn.

**3 phần**:
```
1. DB Migration — Sổ điểm mới:
   Thêm 3 cột vào bảng run_summary:
   - ip_clean_score: điểm IP gradient (0.75 thay vì 0/1)
   - majority_tls_version: "TLS 1.3" hay "TLS 1.2"
   - tls_version_score: điểm TLS (1.0 / 0.7 / 0.0)

2. API — Truyền config:
   Start Test nhận thêm scoring_config (thresholds):
   { "latency_threshold_ms": 300, "jitter_threshold_ms": 50, ... }

3. Dashboard — Hiển thị mới:
   - Form bắt đầu test: thêm section "Scoring Thresholds" (thu gọn được)
   - IP Clean: hiện thanh gradient (0.75) thay vì chỉ ✓/✗
   - TLS Version: hiện "TLS 1.3 (1.0 điểm)" thay vì "TLS: Yes"
```

**Sau Task 10**: Toàn bộ scoring improvements hiển thị đầy đủ trên Dashboard.

---

### Task 11 — E2E Integration Test

**Làm gì**: Test toàn bộ Sprint 4 features — charts render đúng, compare hoạt động, export tải về, error viewer hiển thị, **scoring improvements hoạt động** (IP re-check, gradient IP, TLS version, custom thresholds).

**10 bước test**:
```
1.  Khởi động 5 services
2.  Tạo 2 providers + 2 proxies
3.  Start Test cho cả 2 proxies (có thể set custom thresholds)
4.  Chờ 2-3 phút (data tích lũy)
5.  Charts tab → xem latency + uptime charts
6.  ScoreGauge + ScoreHistoryChart render
7.  Compare page → radar chart + table
8.  Export JSON → file tải về
9.  Export CSV → file tải về
10. Errors tab → xem error log viewer
```

**24 functional checks + 14 logging checks** — chi tiết trong `SPRINT-4-PLAN.md` Task 11.

> So với bản gốc: thêm 4 functional checks (IP stability updates, IP gradient display, TLS version display, custom thresholds) + 2 logging checks (DL13 IP changed WARN, DL14 custom thresholds INFO).

---

## 3. Logging trong Sprint 4

### Tại sao Sprint 4 cần thêm 29 log points?

Sprint 4 thêm nhiều UI features mới (charts, compare, export, errors) + scoring improvements → mỗi feature cần log để debug:
- Chart không render → log ở đâu? (data empty? library error? render crash?)
- Export fail → lỗi ở server hay client? Export run rỗng (0 samples)?
- Compare endpoint chậm → SQL query nào? Provider list fetch fail?
- Error viewer → 1 trong 3 nguồn (HTTP/WS/IP) fetch fail → biết nguồn nào?
- IP thay đổi giữa run → WARN log ngay lập tức
- Custom scoring thresholds → INFO log xác nhận đang dùng config nào

### 3 services, phân bổ log

| Service | Sprint 4 logs | Ví dụ |
|---------|--------------|-------|
| **Runner (Go)** | 2 logs | IP changed WARN (re-check goroutine), Using custom thresholds INFO (scoring) |
| **API (Node.js)** | 8 logs | Export endpoint (5: requested, generated, fail, zero HTTP samples, zero WS samples) + Compare endpoint (3: requested, generated, fail) |
| **Dashboard (Next.js)** | 19 logs | Charts (6: rendered x4, empty state, error boundary), Compare page (5), Export download (3), Error viewer (3: loaded, filter, fetch fail), Score history snapshot (1) |

### API logs chi tiết — 8 log points

**Export endpoint** — 5 logs:
```
"Export requested"              → INFO  → run_id, format (json/csv)
"Export generated"              → INFO  → run_id, format, size/count
"Export fail"                   → ERROR → run_id, format, error_detail
"Export with zero HTTP samples" → WARN  → run_id, format, sample_type
"Export with zero WS samples"   → WARN  → run_id, format, sample_type
```

> 2 WARN mới: khi export 1 run mà không có HTTP hoặc WS samples — thường do run mới start chưa có data, hoặc data pipeline issue.

**Compare endpoint** — 3 logs:
```
"Compare requested"  → INFO → provider_count, provider_ids
"Compare generated"  → INFO → provider_count, provider names
"Compare fail"       → ERROR → provider_ids, error_detail
```

### Dashboard logs chi tiết — 19 log points

**Charts** — 6 logs:
```
"Chart empty data"           → console.warn  → chart_title, empty_message (ChartContainer)
"Chart render error"         → console.error → chart_type, error_detail (ChartErrorBoundary)
"Latency chart rendered"     → console.debug → data_points, latest_p95
"Uptime chart rendered"      → console.debug → data_points, latest_uptime
"Score gauge rendered"       → console.debug → score, grade, color
"Score history snapshot"     → console.debug → history_length, latest_score
```

> Mới: "Chart empty data" (WARN khi chart không có data) + "Chart render error" (ERROR boundary catches recharts crash). 2 events này giúp debug tại sao chart trống hoặc crash.

**Compare page** — 5 logs:
```
"Compare requested"           → console.debug → provider_count
"Compare loaded"              → console.debug → provider_count, provider names
"Compare error"               → console.error → error_detail
"Provider list fetch failed"  → console.error → error_detail (ProviderSelect)
"Comparison table rendered"   → console.debug → provider_count, providers (ComparisonTable)
```

> Mới: "Provider list fetch failed" (ProviderSelect fetch error — trước đây silent) + "Comparison table rendered" (confirm table render).

**Export** — 3 logs:
```
"Export requested"    → console.debug → run_id, format
"Export downloaded"   → console.debug → run_id, format, blob_size
"Export failed"       → console.error → run_id, format, error_detail
```

**Error viewer** — 3 logs:
```
"Error logs loaded"        → console.debug → http_errors, ws_errors, ip_issues
"Error log filter changed" → console.debug → filter_key, filter_value
"Error logs fetch failed"  → console.error → source (http/ws/ip), error_detail
```

> Mới: "Error logs fetch failed" — trước đây Promise.all fail atomic (không biết nguồn nào lỗi), giờ 3 independent fetch + log riêng từng source.

### Tổng Sprint 4: 29 log points mới

| Service | Server | Client | Tổng |
|---------|--------|--------|------|
| Runner (Go) | 2 | 0 | 2 |
| API (Node.js) | 8 | 0 | 8 |
| Dashboard (Next.js) | 0 | 19 | 19 |
| **Tổng** | **10** | **19** | **29** |

> Runner (Go) thêm 2 logs mới từ Task 9: IP changed WARN + custom thresholds INFO.
> Target (Node.js) **KHÔNG cần thêm log**.

---

## 4. Khi nào coi Sprint 4 hoàn thành?

### 20 verification checks (functional)

Kiểm tra mọi thứ hoạt động qua browser + CLI:
1. LatencyChart render 3 đường (P50/P95/P99)
2. UptimeTimeline render vùng xanh/đỏ + đường uptime
3. ScoreGauge hiện điểm + grade đúng màu
4. ScoreHistoryChart hiện đường score + grade bands
5. Charts loading state (spinner)
6. Charts empty state ("No data")
7. Compare page accessible (/compare)
8. ProviderSelect chọn min 2, max 5
9. RadarChart hiện 5 trục + polygons
10. ComparisonTable hiện side-by-side metrics
11. Export JSON tải về file .json
12. Export CSV tải về file .csv
13. Export button disabled khi pending
14. Export spinner khi đang tải
15. Errors tab hiện badge đỏ
16. ErrorLogViewer hiện danh sách lỗi
17. Error row expandable
18. ErrorLogFilters hoạt động
19. Sidebar có link "Compare"
20. Tất cả data flows đúng (API → DB → Dashboard)

### 14 logging checks (DL1-DL14)

Kiểm tra log đúng format:
1. DL1: Latency chart rendered (console.debug)
2. DL2: Uptime chart rendered (console.debug)
3. DL3: Score gauge rendered (console.debug)
4. DL4: Score history snapshot (console.debug)
5. DL5: Compare requested + loaded (console.debug)
6. DL6: Export requested + downloaded (console.debug)
7. DL7: Error logs loaded (console.debug)
8. DL8: API export/compare logs (docker compose logs)
9. DL9: Chart empty data (console.warn — khi Charts tab mở trước khi có data)
10. DL10: Provider list fetch failed (console.error — test bằng tắt API rồi mở /compare)
11. DL11: Export zero samples WARN (docker compose logs — export run chưa có samples)
12. DL12: Chart data aggregation error (console.error — khi data corrupt)
13. DL13: IP changed WARN (docker compose logs runner — khi IP thay đổi giữa run)
14. DL14: Custom thresholds INFO (docker compose logs runner — khi user set non-default thresholds)

> Chi tiết: xem `SPRINT-4-PLAN.md` → Task 11 → Verification Checklist + Logging Verification Checklist.

---

## 5. Sprint 4 KHÔNG làm gì?

| Feature | Ghi chú |
|---------|---------|
| Batch import YAML | Nhập proxy vẫn qua Dashboard form, không import hàng loạt |
| Alerting (email/Slack) | Không gửi notification khi proxy fail |
| Long-running reports (ngày/tuần) | Chỉ có realtime summary, không có báo cáo định kỳ |
| Authentication / Multi-user | Không có login, 1 user duy nhất |
| PDF export | Chỉ JSON + CSV, không có PDF |
| Historical trending (months) | Charts chỉ hiện data per-run, không cross-run trending |
| Mobile responsive | Dashboard optimize cho desktop, chưa mobile |

> Sprint 4 là sprint cuối. Các features trên có thể thêm sau nếu cần, nhưng **không nằm trong scope 4 sprints ban đầu**.

### Cross-sprint logging gaps (ghi nhận, không blocking)

Trong quá trình review Sprint 4, audit toàn bộ 4 sprints phát hiện 8 logging gaps nhỏ ở các sprints trước (ví dụ: scheduler thiếu failure_reason, chưa có correlation IDs xuyên suốt, GET list endpoints không log). Các gaps này **KHÔNG ảnh hưởng Sprint 4** và logging coverage tổng đã đạt ~94%. Chi tiết xem `SPRINT-4-PLAN.md` → Appendix: Cross-Sprint Logging Gap Notes.

---

## 6. Tóm lại

Sprint 4 biến Dashboard từ **"bảng số liệu"** thành **"bảng điều khiển thông minh"** + **nâng cấp scoring engine**:

1. **Charts interactive** — latency P50/P95/P99, uptime timeline, score gauge + history
2. **Radar comparison** — so sánh 2-5 providers bằng 1 biểu đồ mạng nhện
3. **Export JSON/CSV** — tải về báo cáo đầy đủ hoặc bảng tính
4. **Error log viewer** — xem chi tiết từng lỗi, lọc theo loại/protocol
5. **Scoring engine nâng cấp** — IP re-check 60s, gradient IP scoring, TLS version scoring, configurable thresholds
6. **29 log points mới** — debug charts, compare, export, error viewer, scoring (không có silent failures)
7. **45 files** — 24 files mới + 21 files sửa
8. **Sprint 4 = Sprint cuối** — hệ thống hoàn chỉnh sau 4 sprints

**Tổng kết 4 Sprints**:
```
Sprint 1: Backend + Runner         → móng nhà
Sprint 2: Dashboard UI             → cửa + sơn
Sprint 3: WS + IP + Parallel       → điện + nước đầy đủ
Sprint 4: Charts + Compare + Export → nội thất + bảng điều khiển thông minh
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Proxy Stability Test System: HOÀN CHỈNH ✓
```
