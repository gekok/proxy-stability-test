# Báo cáo tiến độ / Progress Report
## Hệ thống đánh giá độ ổn định Proxy

| | |
|---|---|
| **Ngày báo cáo** | 2026-02-26 |
| **Tiến độ tổng** | **75% (3/4 giai đoạn)** |

---

## 1. Tiến độ tổng quan

```
Giai đoạn 1  ████████████████████  XONG
Giai đoạn 2  ████████████████████  XONG
Giai đoạn 3  ████████████████████  XONG
Giai đoạn 4  ░░░░░░░░░░░░░░░░░░░░  CHƯA BẮT ĐẦU
Tổng thể     ███████████████░░░░░  75%
```

---

## 2. Hiện tại hệ thống làm được gì?

### Đã dùng được ngay

| # | Khả năng | Mô tả |
|---|----------|-------|
| 1 | **Nhập proxy qua giao diện web** | Mở browser → nhập nhà cung cấp → nhập proxy (host, port, user, pass, quốc gia) → lưu. Không cần biết command line. |
| 2 | **Bấm 1 nút để test** | Chọn proxy muốn test (1 đến 10 cái) → bấm "Start Test" → hệ thống tự chạy liên tục. |
| 3 | **Test song song 10 proxy cùng lúc** | Chọn 10 proxy từ 10 nhà cung cấp khác nhau → tất cả test đồng thời → so sánh kết quả. |
| 4 | **Xem kết quả realtime** | Trong khi test đang chạy, Dashboard tự cập nhật mỗi 3 giây: điểm, tốc độ, tỷ lệ thành công. |
| 5 | **Dừng bất kỳ lúc nào** | Bấm "Stop Test" → hệ thống dừng an toàn → kết quả cuối lưu vĩnh viễn. Càng chạy lâu → kết quả càng chính xác. |
| 6 | **Chạy hoàn toàn trên máy local** | 1 lệnh `docker compose up -d` → toàn bộ hệ thống khởi động. Không cần VPS hay cloud. |

### Proxy được test những gì?

| # | Tiêu chí test | Hệ thống kiểm tra cái gì | Tại sao quan trọng |
|---|---------------|---------------------------|-------------------|
| 1 | **Tốc độ (Latency)** | Thời gian phản hồi mỗi request qua proxy — đo P50, P95, P99 | Proxy chậm → Zalo lag, timeout |
| 2 | **Độ ổn định (Uptime)** | Bao nhiêu % request thành công trong tổng số | Proxy hay chết → tài khoản Zalo bị gián đoạn |
| 3 | **Độ dao động (Jitter)** | Tốc độ có đều đặn không hay lúc nhanh lúc chậm | Dao động nhiều → khó dự đoán, UX kém |
| 4 | **WebSocket** | Proxy có hỗ trợ kết nối realtime không, tin nhắn có bị mất không | Zalo dùng WebSocket cho nhắn tin realtime |
| 5 | **Bảo mật IP** | IP proxy có bị blacklist không, quốc gia có đúng không, IP có bị đổi giữa chừng không | IP bẩn/sai quốc gia → tài khoản Zalo bị flag |

### Hệ thống chấm điểm tổng hợp

Mỗi proxy nhận **1 điểm duy nhất (0 → 1.0)** dựa trên 5 tiêu chí trên:

```
Điểm tổng = Tốc độ (25%) + Ổn định (25%) + Dao động (15%) + WebSocket (15%) + Bảo mật (20%)
```

| Xếp hạng | Điểm | Ý nghĩa |
|-----------|-------|---------|
| **A** | ≥ 0.90 | Xuất sắc — dùng được cho Zalo |
| **B** | ≥ 0.75 | Tốt — chấp nhận được |
| **C** | ≥ 0.60 | Trung bình — cần cân nhắc |
| **D** | ≥ 0.40 | Kém — không nên dùng |
| **F** | < 0.40 | Rất kém — loại |

### Dashboard hiển thị gì?

| Trang | Nội dung |
|-------|----------|
| **Tổng quan** | Số nhà cung cấp, số proxy, test đang chạy, kết quả gần đây |
| **Quản lý proxy** | Thêm/sửa/xóa nhà cung cấp và proxy |
| **Danh sách test** | Tất cả test runs, lọc theo trạng thái (đang chạy / hoàn thành / lỗi) |
| **Chi tiết test** | 6 thẻ tóm tắt + 4 tab chi tiết: |
| | — Tab HTTP: từng request, method, status, thời gian |
| | — Tab WebSocket: từng kết nối, tốc độ, tin nhắn mất, thời gian giữ |
| | — Tab IP Check: IP có sạch không, quốc gia đúng không, IP ổn định không |
| | — Tab Score: biểu đồ 5 tiêu chí với trọng số |

---

## 3. Đã test thực tế chưa?

**Đã test thành công** với proxy thật:

| Nhà cung cấp | Proxy | Kết quả |
|---------------|-------|---------|
| TunProxy (tunproxy.com) | VN-SNVT2 | HTTP OK, HTTPS OK (TLS 1.3), tốc độ ~300-1000ms |
| TunProxy (tunproxy.com) | VN-SNVT9 | HTTP OK, HTTPS OK (TLS 1.3), chạy song song thành công |

→ Hệ thống **sẵn sàng test proxy thật** từ bất kỳ nhà cung cấp nào.

---

## 4. Giai đoạn tiếp theo (Sprint 4) — còn thiếu gì?

Phần core test đã hoàn chỉnh. Sprint 4 bổ sung **visualization và reporting**:

| # | Tính năng | Giúp gì |
|---|-----------|---------|
| 1 | **Biểu đồ tốc độ theo thời gian** | Nhìn trend tốc độ proxy tăng hay giảm qua thời gian |
| 2 | **Biểu đồ uptime** | Nhìn khoảng thời gian proxy chết vs sống |
| 3 | **Đồng hồ score** | Nhìn nhanh điểm tổng hợp dạng trực quan |
| 4 | **Export CSV/JSON** | Xuất kết quả gửi cho team hoặc đưa vào báo cáo |
| 5 | **So sánh providers** | Đặt 10 nhà cung cấp cạnh nhau trên 1 trang, biểu đồ radar |
| 6 | **Xem log lỗi chi tiết** | Biết chính xác lỗi ở bước nào, proxy nào, lúc nào |

> **Không có Sprint 4, hệ thống vẫn test được đầy đủ** — chỉ thiếu biểu đồ đẹp và export file.

---

## 5. Danh sách nhà cung cấp proxy dự kiến test

Hệ thống được thiết kế để đánh giá và so sánh các nhà cung cấp **Proxy Dân Cư Tĩnh (Static Residential/ISP Proxy)** — loại proxy sử dụng IP thật từ các nhà cung cấp dịch vụ Internet (ISP) như Viettel, VNPT, FPT, đảm bảo độ ổn định cao và khó bị phát hiện.

### Phân khúc Quốc tế Cao cấp

| Nhà cung cấp | Loại IP | SLA/Uptime | Đặc điểm nổi bật |
|---------------|---------|------------|-------------------|
| **Bright Data** | ISP / Static Residential | 99.99% | Tốt nhất cho quy mô lớn, IP sạch, nhắm mục tiêu sâu (City/ASN) |
| **Oxylabs** | Static Residential | 99.95% | Đối thủ của Bright Data, IP cực sạch, ổn định cho doanh nghiệp |
| **IPRoyal** | Static Residential | 99.9% | Cân bằng giá/chất lượng, sticky session tốt cho nuôi tài khoản |

### Phân khúc Nội địa (Hỗ trợ VN)

| Nhà cung cấp | Loại IP | SLA/Uptime | Đặc điểm nổi bật |
|---------------|---------|------------|-------------------|
| **ThueCloud** | Static Residential / IPv4 | Khá & Ổn định | Phổ biến cho MMO, IP thực từ ISP lớn (Viettel, FPT, VNPT), băng thông không giới hạn |
| **Enode** | Static Residential / SOCKS5 | Khá & Ổn định | Chuyên SOCKS5, tốc độ ổn định, hỗ trợ White IP tăng bảo mật |
| **ZingServer** | SOCKS5 | Ổn định | Thâm niên thị trường, tối ưu cho MMO, độ trễ thấp và IP cố định |
| **AZVPS** | Private IPv4 | Ổn định | Được giới MMO tin dùng vì IP ít bị "dirty", hỗ trợ gia hạn giữ nguyên IP cũ |

### Tổng hợp theo phân khúc

| Phân khúc | Nhà cung cấp tiêu biểu | Đặc điểm quan trọng |
|-----------|------------------------|---------------------|
| **Quốc tế Cao cấp** | Bright Data, Oxylabs | SLA rất cao (99.9%+), IP sạch, tối ưu cho quy mô lớn và nhắm mục tiêu sâu |
| **Quốc tế Cân bằng** | IPRoyal, Webshare | Giá cạnh tranh, phù hợp quy mô vừa, hỗ trợ sticky session |
| **Nội địa** | ThueCloud, Enode, AZVPS | Tối ưu độ trễ trong nước, hỗ trợ tiếng Việt, thanh toán nội địa, IP dân cư thực từ ISP lớn |

### Tiêu chí lựa chọn quan trọng

| Tiêu chí | Yêu cầu | Hệ thống đo được |
|----------|---------|-------------------|
| **IP sạch** | Không bị blacklist (Spamhaus, Barracuda...) | Có — DNSBL check 4 servers |
| **Uptime cao** | ≥ 99.9% | Có — đo uptime ratio realtime |
| **Đúng quốc gia** | IP thật ở VN khi mua proxy VN | Có — GeoIP verification |
| **IP ổn định** | Không đổi IP giữa session | Có — IP stability check mỗi 30s |
| **Hỗ trợ WebSocket** | Cho Zalo realtime messaging | Có — WS/WSS tester |
| **Chịu tải tốt** | Không bị throttle khi traffic cao | Có — burst test 100 requests đồng thời |
| **Latency thấp** | P95 < 200ms (cùng region) | Có — đo P50/P95/P99 |

> Hệ thống sẽ test tất cả nhà cung cấp trên cùng điều kiện, cùng thời điểm, ra **1 bảng xếp hạng A-F** — chọn proxy tốt nhất bằng dữ liệu thực, không bằng quảng cáo.

---

## 6. Tóm tắt

| | |
|---|---|
| **Đã làm được** | Test đầy đủ HTTP + HTTPS + WebSocket + IP Security, chấm điểm 5 tiêu chí, test song song 10 proxy, dashboard realtime, đã verified với proxy thật |
| **Chưa làm** | Biểu đồ, export CSV/JSON, so sánh side-by-side providers (Sprint 4) |
| **Kết luận** | **Pipeline test proxy đã hoàn chỉnh.** Có thể bắt đầu test proxy thật ngay bây giờ để chọn nhà cung cấp tốt nhất cho hệ thống Zalo. |
