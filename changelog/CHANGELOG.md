# Changelog — Proxy Stability Test System

Ghi lại toàn bộ quá trình phát triển project, từ lên plan đến implementation.

---

## 2026-02-24 — Planning Phase

### v0.1 — Plan ban đầu
- Tạo plan đầu tiên dựa trên yêu cầu test proxy cho hệ thống Zalo
- Tech stack: Go (Runner) + Node.js/TypeScript (API, Dashboard) + PostgreSQL
- Kiến trúc: 4 services (Runner, API, Target, Dashboard) + PostgreSQL

### v0.2 — Review & Fix issues
- Fix `dns_ms` field (client không đo được DNS target qua proxy) → removed
- Thêm `ws_sample` fields: `started_at`, `connection_held_ms`, `disconnect_reason`
- Thêm `run_summary` TLS p50/p95/p99
- Thêm `is_warmup` flag

### v0.3 — Thêm Logging Spec
- Thêm Section 9: Logging & Observability Spec (7 subsections)
- Structured JSON logs cho tất cả services
- Log points chi tiết cho từng module

### v0.4 — Cập nhật cho Local-only + 10 proxies + 1000 RPM
- Deploy: local only (Docker Compose)
- Scale: 10 proxies / 10 providers song song
- Rate: 1000 requests/min/proxy

### v0.5 — UI-primary input + Continuous mode
- Dashboard UI là primary input (không cần biết YAML)
- Runner là long-running process (nhận trigger từ API)
- Test chạy liên tục đến khi user bấm Stop hoặc tắt Docker
- Graceful stop flow: running → stopping → completed
- Rolling summary mỗi 30 giây
- Password encrypted (AES-256-GCM) trong DB

### v0.6 — HTTP + WS song song + Request/Response detail
- 3 goroutines per proxy: HTTP/HTTPS, WS, Summary
- Chi tiết Request/Response cho HTTP, HTTPS, WebSocket
- Target endpoints table

### v0.7 — HTTPS logging + Error classification mở rộng
- Thêm `proxy.https_tester` module logging (3 giai đoạn: CONNECT, TLS, HTTPS)
- WSS CONNECT+TLS log points
- WS ping/pong logging
- Error classification: 8 → 17 types

### v0.8 — Tách HTTP/HTTPS goroutines + Per-method testing
- **4 goroutines per proxy** (thay vì 3):
  - Goroutine 1: HTTP (plain) — 500 RPM
  - Goroutine 2: HTTPS (CONNECT tunnel) — 500 RPM
  - Goroutine 3: WS/WSS — 60 msg/min
  - Goroutine 4: Rolling Summary
- **Test từng HTTP method**: GET, POST, PUT, PATCH, DELETE, HEAD
- RPM split: `http_rpm: 500` + `https_rpm: 500` = 1000 RPM total
- DB schema: thêm `is_https`, `http_rpm`/`https_rpm`, `total_https_samples`
- Target `/echo` chấp nhận ALL methods
- Target listen 2 ports: :3001 (HTTP) + :3443 (HTTPS)
- Full consistency check passed

---

### v0.9 — WebSocket chi tiết ngang bằng HTTP/HTTPS
- Viết lại toàn bộ "WebSocket Test — Request & Response" section
- Tách rõ WS (plain, 2 giai đoạn) vs WSS (encrypted, 4 giai đoạn: TCP → CONNECT → TLS → WS upgrade)
- Thêm connection alternation logic (ws ↔ wss xen kẽ)
- Thêm echo message JSON format chi tiết (type, seq, connection_num, ts, payload)
- Thêm drop detection logic (timeout 5s, đếm sent vs received)
- Thêm ping/pong protocol chi tiết (mỗi 10s, 3x consecutive timeout → dead)
- Thêm connection lifecycle & reconnection logic (retry 3x backoff, chờ 10s, không bỏ cuộc)
- Thêm disconnect_reason table (6 reasons: client_close, server_close, proxy_close, pong_timeout, error, timeout)
- Thêm WS vs WSS metrics comparison table
- Bổ sung WS logging: connection alternation, per-connection summary, retry, consecutive pong timeout
- Cập nhật correlation example với WS connection chi tiết

### v1.0 — Sprint 1 consistency fix (6 issues)
- Fix Phase 3 goroutine description: WS goroutine TỒN TẠI nhưng placeholder (4 goroutines, không phải 3)
- Fix `ws_mpm` → `ws_messages_per_minute` trong trigger payload
- Thêm `log/slog` vào Go dependencies + note gorilla/websocket deferred Sprint 3
- Thêm Error Classification reference section (17 error types, phân theo Sprint)
- Clarify WS placeholder: goroutine chạy, log started/stopped, KHÔNG gửi request
- Clarify "KHÔNG làm Sprint 1" table thêm cột ghi chú Sprint 1 scope

### v1.1 — Sprint 1 Detail Plan
- Tạo `SPRINT-1-PLAN.md` — chi tiết từng task cho Sprint 1
- 9 tasks theo thứ tự dependency
- Mỗi task có: files cần tạo, spec chi tiết, code example, acceptance criteria
- Integration test E2E kịch bản + 20 verification checks

## 2026-02-25 — Planning & Logging Review

### v1.2 — Logging Spec nâng cấp toàn diện (15+ gaps fixed)

**PROXY-TEST-PLAN.md (Section 9) — Bổ sung log points**:

1. **`phase` field bắt buộc**: Thêm quy tắc mọi Runner log entry PHẢI có `phase` field. Thêm `phase` vào mọi event row trong bảng log points (http_tester, https_tester, ws_tester, orchestrator)
2. **`request_type` field mới**: Thêm field `request_type` (echo/bandwidth/timeout_test/ip_check) vào http_tester + https_tester để phân biệt request /echo vs /large vs /slow vs /ip
3. **Runner startup logging**: Thêm `Runner process starting` + `Runner config loaded` vào `server.handler` module với config summary (port, api_url, go_version)
4. **HTTP/HTTPS transport creation**: Thêm `HTTP transport created` + `HTTPS transport created` log khi tạo HTTP client với proxy settings
5. **Cancel signal per goroutine**: Thêm `Cancel signal received` riêng cho mỗi goroutine (http, https, ws) thay vì chỉ orchestrator
6. **Draining in-flight**: Thêm `Draining in-flight requests` + `Draining in-flight request` + `Drain timeout forced stop` cho graceful shutdown
7. **Warmup per-request logging**: Thêm `Warmup start` + `Warmup request success` + `Warmup request fail` cho orchestrator (log từng warmup request, không chỉ summary)
8. **Orchestrator phases rõ ràng**: Tách orchestrator thành 7 phase sections (startup, connectivity, ip_check, warmup, continuous, stopping, final_summary) với log riêng mỗi phase
9. **Sample channel monitoring**: Thêm `Sample channel near capacity` (WARN > 80%) + `Sample channel full` (ERROR) vào orchestrator
10. **Result collector enrichment**: Thêm `Batch assembled`, `Summary diff`, `Percentile calc per protocol` vào result_collector
11. **Target Service phân biệt HTTP/HTTPS**: Thêm `server_port` + `protocol` vào mọi Target log entry. Thêm `index` startup section (HTTP/HTTPS server started, TLS cert loaded, All routes mounted)
12. **HTTPS non-200 status**: Thêm log entry mới cho HTTPS non-200 (trước chỉ có ở HTTP tester)
13. **Orchestrator complete**: Thêm `Orchestrator complete` log ở cuối final_summary phase

**Ví dụ log nâng cấp**:
- Timeline example mở rộng: 7 phases rõ ràng thay vì flat timeline
- Thêm ví dụ: warmup logs, graceful stop logs
- HTTPS success example thêm `request_type`, `goroutine`, `phase` fields

**Filter queries mở rộng**:
- Thêm filter theo `phase` (warmup, connectivity, stopping)
- Thêm filter theo `request_type` (bandwidth, ip_check, timeout_test)
- Thêm filter theo `error_type` pattern (connect_tunnel*, tls_*)
- Thêm filter Target Service by `server_port`
- Thêm filter nâng cao: HTTPS gãy giai đoạn nào, sample channel issues

**SPRINT-1-PLAN.md — Bổ sung logging**:

14. **Task 2 logging mở rộng**: Bảng 11 event rows (thay vì 5), có `server_port` + `protocol` mọi entry
15. **Task 3 logging mở rộng**: Bảng 4 layers (Request, Services, Database, Error handler), 20+ event rows (thay vì 11)
16. **Sprint 1 Logging Reference section**: Map rõ Task → Module → Log points. Mỗi task liệt kê bắt buộc implement log nào, tham chiếu Section 9.3. Có code example slog call cho dialer. Có request_type mapping function
17. **Logging Verification Checklist (L1-L20)**: 20 checks cụ thể cho logging + bash script tự động verify phases, goroutines, missing fields, error completeness, password leak

### v1.3 — Cập nhật Explanation + Tổ chức folder Sprint

**Tổ chức lại folder**:
- Tạo 4 folder: `sprint-1/`, `sprint-2/`, `sprint-3/`, `sprint-4/` trong `requirements/`
- Di chuyển `SPRINT-1-PLAN.md` vào `sprint-1/`

**Cập nhật `PLAN-EXPLANATION.md`**:
- Thêm Section 5: "Logging — Tại sao quan trọng?" — giải thích logging cho non-technical
  - Log là gì, hệ thống log như thế nào
  - Ví dụ 1 dòng log JSON với giải thích từng field
  - 3 trường hợp HTTPS fail ở 3 giai đoạn khác nhau
  - 7 phases và cách filter log theo phase
- Thêm tổng quan 4 Sprints (sơ đồ flow)
- Thêm 9 tasks Sprint 1 với mô tả ngắn
- Thêm link đến folder sprint-N
- Thêm cấu trúc files cuối file
- Cập nhật Section 6 "Tóm lại" thêm item #7: log chi tiết

**Tạo `sprint-1/SPRINT-1-EXPLANATION.md`** — giải thích Sprint 1 cho non-technical:
- Section 0: Sprint 1 làm gì (overview)
- Section 1: 9 tasks (bảng tóm tắt + dependency diagram)
- Section 2: Giải thích từng task (Task 1-9)
  - Target Service: 5 endpoints, tại sao cần HTTP + HTTPS
  - API: flow user → API → Runner, tại sao password mã hóa
  - HTTP Tester: tại sao 6 methods, xoay vòng ra sao, đo gì
  - HTTPS Tester: 3 giai đoạn, tại sao log riêng, đo thêm gì
  - Engine: Orchestrator 7 phases, 4 goroutines, Scheduler, Result Collector
  - Reporter + Scorer: batch gửi, scoring 3 tiêu chí Sprint 1
  - Integration Test: 7 bước E2E
- Section 3: Logging trong Sprint 1 (4 services, Runner log chi tiết nhất)
- Section 4: Khi nào coi Sprint 1 hoàn thành (20+20 checks)
- Section 5: Sprint 1 KHÔNG làm gì (deferred table)

### v1.4 — Sprint 2 Detail Plan (Dashboard UI + Basic Flow)

**Tạo `sprint-2/SPRINT-2-PLAN.md`** — chi tiết 9 tasks cho Sprint 2:
- Task 1: Dashboard Project Setup + Layout + Navigation (Next.js 14, Tailwind CSS, 11 UI components, Sidebar, pino logger, Dockerfile multi-stage)
- Task 2: API Client Module + Shared Types + Custom Hooks (fetch wrapper với 9 log points, TypeScript types match DB schema, usePolling/useProviders/useProxies/useRuns/useRunDetail hooks)
- Task 3: Providers Page (list table, add/edit modal form, delete confirmation, empty/loading/error states)
- Task 4: Proxies Management (CRUD grouped by provider, password handling: create/edit/never-return, form validation)
- Task 5: Start Test Flow (3-step dialog: select proxies → configure RPM/timeout → create runs + trigger → redirect)
- Task 6: Runs List Page (table with status filter tabs, auto-poll 5s khi active runs, status badges with pulse animation)
- Task 7: Run Detail Page (RunHeader + 4 SummaryCards + MetricsDetail + HttpSamples, polling 3s, Stop button with confirmation)
- Task 8: Overview Page (3 stat cards, active tests list, recent results list, auto-poll)
- Task 9: Integration Test E2E (9 bước browser, 20 functional checks, 15 logging checks, verify script)

**Logging spec cho Dashboard — 41 log points (10 gốc + 31 mới)**:
- api-client: 9 logs (success 200/201/204, client error 4xx, server error 5xx, timeout, connection refused, unreachable, parse error)
- Provider page: 6 logs (created, updated with fields_changed, deleted, create/update/delete fail)
- Proxy page: 7 logs (CRUD + password_changed boolean + form validation client-side)
- Start Test: 5 logs (config customized, runs created, started, create fail with partial count, trigger fail)
- Run Detail/Stop: 6 logs (stopped with running_for_ms, stop fail, status changed, first summary, polling started/stopped)
- usePolling: 6 logs (started, success, fail, paused, resumed, cleanup)
- Form validation: 1 log (client console, fields_with_errors)
- Page error: 1 log (invalid route, page_path + error_detail)

**Security**: Password KHÔNG BAO GIỜ xuất hiện trong log. `password_changed` chỉ là boolean.

**Tạo `sprint-2/SPRINT-2-EXPLANATION.md`** — giải thích Sprint 2 cho non-technical:
- Section 0: Sprint 2 làm gì (UI overview + architecture diagram)
- Section 1: 9 tasks (bảng tóm tắt + dependency diagram)
- Section 2: Giải thích từng task (Task 1-9)
  - Setup: Sidebar, UI components, layout
  - API Client: tại sao cần, polling là gì
  - Providers/Proxies: form flow, password bảo mật
  - Start Test: 3-step dialog
  - Runs List: filter, status badges, auto-update
  - Run Detail: realtime 4 cards, percentiles, samples, Stop button
  - Overview: stat cards, active tests, recent results
- Section 3: Logging (2 loại: server pino + client console, 41 log points)
- Section 4: Khi nào hoàn thành (20 + 15 checks)
- Section 5: Sprint 2 KHÔNG làm gì (deferred: WS, IP check, charts, export)
- Section 6: Tóm lại (7 key deliverables)

### v1.5 — Sprint 2 Logging Review — 7 gaps fixed (41 → 49 log points)

**Cross-review Plan tổng × Sprint 2 — phát hiện và sửa 7 gaps**:

1. **G1: Dashboard startup log thiếu** (HIGH)
   - DL1 check expect log khi start nhưng không có event nào defined
   - Fix: Thêm `Dashboard started` INFO log trong `lib/logger.ts` khi module load
   - Fields: `api_url`, `node_env`, `log_level`, `module: "startup"`

2. **G2: Provider form validation không log** (MEDIUM)
   - Module 8 nói `form_name: provider` nhưng chỉ proxy form implement
   - Fix: Thêm `validateProviderForm()` với console.warn "Form validation failed"

3. **G3: Test config form validation không log** (MEDIUM)
   - TestConfigForm validate min/max nhưng không log
   - Fix: Thêm `validateTestConfig()` với console.warn "Form validation failed"

4. **G4: Summary 404 spam WARN log** (HIGH)
   - New run chưa có summary → API trả 404 → api-client log WARN mỗi 3s → LOG SPAM
   - Fix: Thêm `suppressNotFound` option vào api-client → 404 trả null + log DEBUG thay vì throw + WARN
   - Thêm log event #10: `API call not found (suppressed)` level DEBUG

5. **G5: Page error chỉ cho /runs/[runId]** (MEDIUM)
   - Thiếu error boundary cho providers page, overview page, runs list
   - Fix: Thêm `src/app/error.tsx` global error boundary + per-page error logging
   - 4 page error logs: global, providers, runs list, overview

6. **G6: Partial fetch failure silent** (LOW)
   - useRunDetail `.catch(() => null)` nuốt lỗi summary/samples
   - Fix: Thêm console.warn "Run summary fetch failed" + "Run samples fetch failed" trong catch

7. **G7: Plan tổng Section 9.3 Dashboard chưa sync** (HIGH)
   - Plan tổng chỉ có 13 events (4 api-client + 6 pages + 3 browser)
   - Sprint 2 có 49 events nhưng plan tổng chưa cập nhật
   - Fix: Viết lại toàn bộ Dashboard section trong PROXY-TEST-PLAN.md Section 9.3
   - Thêm 8 module tables: startup, api-client (10), providers (6), proxies (6), test (5), runs (2), error-boundary (4), browser (15)

**Cập nhật Sprint 2 Plan**:
- Logging: 41 → 49 log points (34 server + 15 client)
- Verification: DL1-DL15 → DL1-DL20 (thêm DL16-DL20: startup, form validation, suppressed 404, error boundary, partial fetch)
- Task 1: thêm `error.tsx`, thêm acceptance criteria cho startup log
- Task 2: thêm `suppressNotFound` option, thêm partial fetch failure logs
- Task 3: thêm provider form validation code + log
- Task 5: thêm test config validation code + log
- Task 7: thêm global error boundary (error.tsx)
- Task 9: 15 → 20 logging checks, thêm verify script cho DL16/DL18

**Cập nhật Plan tổng (PROXY-TEST-PLAN.md)**:
- Section 9.3 Dashboard: viết lại hoàn toàn (13 → 49 events)
- Tách api-client: "API call fail" → "API client error (4xx)" WARN + "API server error (5xx)" ERROR
- Tách "API unreachable" → timeout + connection refused + unreachable
- Thêm module mới: startup, error-boundary
- Thêm bảng tổng kết Dashboard logging (34 server + 15 client = 49)

### v1.6 — Sprint 3 Detail Plan (WebSocket + IP Check + Parallel)

**Tạo `sprint-3/SPRINT-3-PLAN.md`** — chi tiết 9 tasks cho Sprint 3:
- Task 1: Target WS Echo Full Implementation (echo mọi message, ping/pong 10s, hold duration, close frame, HTTP+HTTPS)
- Task 2: Go Runner WS Tester (ws/wss alternation, CONNECT tunnel, echo 60 msg/min, ping/pong, drop detection, reconnection 3x retry)
- Task 3: Go Runner IP Checker (DNSBL 4 servers blacklist lookup, GeoIP country verification via ip-api.com, IP stability tracking mỗi 30s)
- Task 4: Go Runner Scheduler Upgrade (multi-proxy max 10 parallel, semaphore, panic recovery, proxy isolation)
- Task 5: Go Runner Concurrency Burst Test (100 goroutines đồng thời mỗi 5 phút, phát hiện throttle/rate limit)
- Task 6: Go Runner Scoring Upgrade (3 → 5 components: +S_ws +S_security, weight redistribution khi phase skipped, grade A-F)
- Task 7: Controller API WS/IP Endpoints (batch insert ws-samples max 100/call, ip-checks CRUD, summary ws_*/ip_*/score_ws/score_security)
- Task 8: Dashboard UI (6 summary cards, 4 tabs: HTTP/WS/IP/Score Breakdown, 5-component score display, multi-proxy view)
- Task 9: Integration Test E2E (11 bước, 25 functional checks, 10 logging checks RL1-RL10, quick verify script)

**Logging Sprint 3 — 54 new log points (51 server + 3 client)**:
- `proxy.ws_tester`: 26 events (goroutine lifecycle, CONNECT/TLS/Upgrade, message loop, ping/pong, reconnection)
- `ipcheck.blacklist`: 4 events (check start, clean, listed, query fail)
- `ipcheck.geoip`: 3 events (lookup done, mismatch, API fail)
- `proxy.http_tester`: 1 event (IP changed)
- `engine.scheduler`: 5 events (start, proxy goroutine start/done, panic recovered, all done)
- `engine.orchestrator` (burst): 2 events (burst start, burst complete)
- `scoring.scorer`: 4 events (score computed, component scores, phase skipped, all metrics null)
- `ws.wsEcho` (Target): 6 events (connection opened, message echoed, pong received, hold reached, connection closed, error)
- `pages/runs` (Dashboard client): 3 events (WS tab loaded, IP check loaded, Score breakdown loaded)

**Key features Sprint 3**:
- WS full implementation: ws/wss alternation, echo loop 60 msg/min, ping/pong 10s, drop detection 5s timeout, reconnection never gives up
- IP Check: DNSBL blacklist (4 servers), GeoIP country match, IP stability tracking
- Multi-proxy: max 10 parallel via semaphore, panic recovery per goroutine, proxy isolation
- Burst test: 100 concurrent goroutines mỗi 5 phút
- Scoring: 5 components (Uptime 25%, Latency 25%, Jitter 15%, WS 15%, Security 20%), grade A-F
- Go dependency: `github.com/gorilla/websocket`
- ~6 files mới + ~14 files sửa = ~20 files total

**Tạo `sprint-3/SPRINT-3-EXPLANATION.md`** — giải thích Sprint 3 cho non-technical:
- Section 0: Sprint 3 làm gì (before/after diagram)
- Section 1: 9 tasks (bảng tóm tắt + dependency diagram)
- Section 2: Giải thích từng task (WS = đường dây điện thoại, IP = kiểm tra lý lịch, Scheduler = 10 bác sĩ, Burst = stress test, Scoring = chấm 5 môn)
- Section 3: Logging (54 log points, 3 services)
- Section 4: Khi nào hoàn thành (25 functional + 10 logging checks)
- Section 5: Sprint 3 KHÔNG làm gì (deferred: charts, compare, export, alerting)
- Section 6: Tóm lại (7 key deliverables)

### v1.7 — Sprint 4 Detail Plan (Advanced Dashboard + Export)

**Tạo `sprint-4/SPRINT-4-PLAN.md`** — chi tiết 8 tasks cho Sprint 4 (sprint cuối):
- Task 1: Chart Library Setup + Shared Utilities (install recharts, ChartContainer responsive wrapper, ChartTooltip, chart-utils.ts với CHART_COLORS, formatMs, formatPercent, gradeColor, scoreColor)
- Task 2: LatencyChart + UptimeTimeline (useChartData hook time-bucket aggregation, LineChart P50/P95/P99, AreaChart stacked success/error + uptime ratio line)
- Task 3: ScoreGauge + Score History (RadialBarChart score+grade, ScoreHistoryChart with grade threshold bands, useSummaryHistory sliding window 200 points)
- Task 4: Controller API — Export + Compare (GET /runs/:id/export JSON/CSV with Content-Disposition, GET /providers/compare SQL aggregation across latest completed runs, exportService)
- Task 5: Comparison Page — Radar Chart (/compare page, ProviderSelect multi-select min 2 max 5, RadarCompareChart 5 axes: Uptime/Latency/Jitter/WS/Security, ComparisonTable side-by-side metrics, useCompare hook)
- Task 6: Export Feature — Download (ExportButton dropdown JSON/CSV with spinner, useExport blob → URL.createObjectURL → download trigger, integrate RunHeader + Runs List)
- Task 7: Error Log Viewer (ErrorLogEntry unified type source: http|ws|ip, useErrorLogs fetch+merge+filter, ErrorLogViewer expandable rows color-coded, ErrorLogFilters source/error_type/protocol, Errors tab with badge count)
- Task 8: E2E Integration Test (10-step scenario, 20 functional checks, DL1-DL8 logging checks, quick verify bash script)

**Logging Sprint 4 — 20 new log points (6 server + 14 client)**:
- `routes.export` (API server): 6 events (export requested/generated/fail, compare requested/generated/fail)
- `charts.latency` (Dashboard client): 2 events (latency chart rendered, render error)
- `charts.uptime` (Dashboard client): 1 event (uptime chart rendered)
- `charts.score_gauge` (Dashboard client): 1 event (score gauge rendered)
- `charts.score_history` (Dashboard client): 2 events (score history snapshot, render error)
- `pages.compare` (Dashboard client): 3 events (compare requested, loaded, error)
- `pages.export` (Dashboard client): 3 events (export requested, downloaded, failed)
- `pages.errors` (Dashboard client): 2 events (error logs loaded, filter changed)

**Key features Sprint 4**:
- recharts charts: LatencyChart (P50/P95/P99 line), UptimeTimeline (stacked area), ScoreGauge (radial bar), ScoreHistoryChart (line + grade bands)
- Radar comparison: 5-axis radar chart so sánh 2-5 providers, ComparisonTable side-by-side
- Export JSON/CSV: full RunExport (meta + summary + scoring + samples + ip_checks), CSV flattened http_samples
- Error log viewer: unified errors from http + ws + ip sources, expandable rows, filters
- npm dependency: `recharts ^2.12.0`
- 22 files mới + 9 files sửa = 31 files total

**Tạo `sprint-4/SPRINT-4-EXPLANATION.md`** — giải thích Sprint 4 cho non-technical:
- Section 0: Sprint 4 làm gì (before/after diagram — số liệu → charts + compare + export)
- Section 1: 8 tasks (bảng tóm tắt + dependency diagram)
- Section 2: Giải thích từng task (Chart library = hộp bút màu, LatencyChart = máy đo nhịp tim, ScoreGauge = đồng hồ tốc độ xe, API Export = phòng hồ sơ, Radar = bảng so sánh sản phẩm, Export button = nút tải về, Error viewer = sổ ghi lỗi)
- Section 3: Logging (20 log points, 2 services: API 6 + Dashboard 14)
- Section 4: Khi nào hoàn thành (20 functional + 8 logging checks)
- Section 5: Sprint 4 KHÔNG làm gì (deferred: batch import YAML, alerting email/Slack, long-running reports, authentication, PDF export, historical trending, mobile responsive)
- Section 6: Tóm lại (7 key deliverables + tổng kết 4 sprints: hệ thống HOÀN CHỈNH)

### v1.8 — Sprint 4 Logging Review — 6 gaps fixed (20 → 26 log points)

**Cross-review Sprint 4 plan — phát hiện và sửa 6 logging gaps**:

1. **G1: ChartContainer empty state không log** (MEDIUM)
   - ChartContainer hiện "No data" nhưng không log → khó debug tại sao chart trống
   - Fix: Thêm `console.warn('Chart empty data', { module: 'charts.container', chart_title, empty_message })`

2. **G2: ProviderSelect fetch không có error handling** (HIGH)
   - `apiClient.get('/providers').then(...)` không có `.catch()` → silent failure
   - Fix: Thêm `.catch()` với `console.error('Provider list fetch failed', { module, error_detail })`

3. **G3: useErrorLogs Promise.all fails atomically** (HIGH)
   - 3 API calls wrapped trong `Promise.all` → 1 fail = tất cả fail, không biết nguồn nào lỗi
   - Fix: Tách thành 3 independent try-catch blocks, mỗi source (http/ws/ip) log riêng
   - Thêm `console.error('Error logs fetch failed', { source, error_detail })`
   - Fix stale state reference: dùng local variables thay vì state (httpErrors.length → fetchedHttpErrors.length)

4. **G4: Chart render error events claimed nhưng KHÔNG implement** (HIGH)
   - Tasks 2+3 logging tables liệt kê "Chart render error" nhưng không có React error boundary
   - Fix: Tạo `ChartErrorBoundary.tsx` — React class component catches render errors
   - `componentDidCatch` → `console.error('Chart render error', { chart_type, error_detail })`
   - Error UI hiển thị error message + Retry button

5. **G5: Export 0 samples không WARN** (MEDIUM)
   - Export run chưa có data trả JSON/CSV rỗng mà không cảnh báo
   - Fix: Thêm `logger.warn('Export with zero HTTP samples')` + `logger.warn('Export with zero WS samples')` trong exportService

6. **G6: ComparisonTable không log render** (LOW)
   - RadarCompareChart + ComparisonTable render nhưng chỉ useCompare hook log
   - Fix: Thêm `console.debug('Comparison table rendered', { provider_count, providers })` trong ComparisonTable

**Cập nhật Sprint 4 Plan**:
- Logging: 20 → 26 log points (8 server + 18 client)
- Verification: DL1-DL8 → DL1-DL11 (thêm DL9: chart empty, DL10: provider fetch error, DL11: export zero samples)
- Task 1: thêm `ChartErrorBoundary.tsx`, thêm ChartContainer empty WARN, files 3→4 new
- Task 4: thêm 2 WARN events cho zero samples, logging 6→8 events
- Task 5: thêm ProviderSelect .catch(), ComparisonTable render log, logging 3→5 events
- Task 7: Promise.all → 3 independent try-catch, fix stale state, logging 2→3 events
- Task 8: DL1-DL8 → DL1-DL11
- Files: 22→23 new, 31→32 total (thêm ChartErrorBoundary.tsx)
- Thêm Appendix: Cross-Sprint Logging Gap Notes (8 gaps ghi nhận, không blocking)

**Cập nhật Sprint 4 Explanation**:
- Section 3: 20→26 log points, cập nhật bảng phân bổ API/Dashboard
- Section 4: DL1-DL8 → DL1-DL11
- Section 5: Thêm cross-sprint gaps note
- Section 6: 20→26 log points, 31→32 files

**Thêm Client-side Logging Convention section** trong SPRINT-4-PLAN.md:
- Module field bắt buộc cho mọi client log
- clientLog() helper pattern

### v1.9 — Cross-Document Audit Fix (12 issues across 9 files)

**Full audit of all 11 documents (5 plans + 5 explanations + 1 changelog) — 12 issues found and fixed**:

### Fixed
- **H1**: Sprint 3 Runner table missing `proxy.http_tester (IP changed)` row (44→45)
- **H2**: Sprint 4 ChartErrorBoundary module attribution — dynamic `'charts.' + chartType` thay vì hardcoded `'charts.error_boundary'`
- **H3**: Sprint 2 RunSummary type fields clarified — computed ratios from DB counts (comments added)
- **H4**: Sprint 3 API POST endpoints logging reference made explicit (Sprint 1 pino-http + route-level)
- **H5**: Sprint 4 useChartData error handling added — try/catch for bucketByTime/percentile (+1 event, 26→27)
- **H6**: Sprint 4 RunCharts ChartErrorBoundary wrapping example added (all 4 charts wrapped)
- **M1**: Sprint 1 Plan file count section added (~41 files)
- **M2**: Sprint 1-3 Explanations file counts added to summary sections
- **M3**: Sprint 2 Explanation log count headings fixed (29→34 server, 12→15 client)
- **M4**: CHANGELOG version ordering fixed (chronological: v1.0→v1.8)
- **L1**: Sprint 3 backoff_ms code path clarification (normal vs retry exhaustion)
- **L2**: Sprint 4 parameterized event counting convention note added

### Updated Counts
- Sprint 4: 26→27 log events (8 server + 19 client)
- Sprint 4: DL1-DL11→DL1-DL12
- Sprint 4 Explanation: mirrors 27 events
- Sprint 3 Runner table: 44→45 (matches grand total)

### v2.0 — Comprehensive Review & CLAUDE.md (14 issues)

### Fixed
- **H1**: RunStatus TypeScript type missing 'cancelled' (6 DB values, was 5 in TS)
- **H2**: TestRun field mapping clarified (ended_at→finished_at, added stopped_at)
- **H3**: TLS percentile field naming aligned (DB tls_p50_ms ↔ TS tls_handshake_p50_ms)
- **H4**: Sprint 4 exportService weight redistribution note added
- **H5**: Sprint 4 Explanation "18 logs" → "19 logs" in descriptive text
- **H6**: Sprint 3 WS tester CONNECT/TLS timing implementation note added
- **M1**: Encryption key env var documented (ENCRYPTION_KEY)
- **M2**: Target TLS cert generation Dockerfile/entrypoint note added
- **M3**: Warmup filtering location clarified (Runner + API both filter)
- **M4**: Protocol enum 'https' usage clarified in DB schema
- **M5**: Scoring "phase skipped" definition clarified (ws_enabled flag)
- **L1**: Sprint 4 "+err" notation explained (no double-counting)
- **L2-L3**: Acknowledged, no changes (pino-http covers GET, CS-7 logged)

### Added
- `CLAUDE.md` — project context file for AI-assisted development

## 2026-02-26 — Implementation Phase

### v3.0 — Sprint 1 Implementation Complete

**Toàn bộ Sprint 1 (9 tasks) đã implement và E2E verified.**

**Infrastructure:**
- `docker-compose.yml` — 5 services: postgres (port 5433), target, api, runner, dashboard
- `.env` / `.env.example` — DB: postgres/123, ENCRYPTION_KEY, all service URLs
- `.gitignore` — node_modules, dist, .env, pgdata, Go binaries, TLS certs
- `database/schema.sql` + `migrations/001_initial_schema.sql` — 7 tables + uuid-ossp

**Target Service (10 files):**
- HTTP (:3001) + HTTPS (:3443) with self-signed TLS certs
- Routes: /echo (ALL methods), /ip, /large (streaming), /slow (delay), /health
- WebSocket echo with ping/pong
- pino structured logging

**Controller API (14 files):**
- Express :8000, pino-http middleware
- CRUD: providers, proxies (AES-256-GCM encryption), runs
- Batch sample ingestion (POST /runs/:id/http-samples/batch, max 100)
- Summary upsert (ON CONFLICT), cursor-based pagination
- Run lifecycle: create → trigger Runner → receive results → stop

**Go Runner (14 files):**
- HTTP server :9090, graceful shutdown (SIGTERM/SIGINT)
- HTTP tester: 500 RPM, 6-method rotation, /large + /slow every 10th batch, IP check every 30s
- HTTPS tester: CONNECT tunnel, TLS handshake, 3-phase measurement
- Engine: 5-phase orchestrator, single-proxy scheduler, result collector (P50/P95/P99)
- Reporter: API reporter with 3x retry + exponential backoff
- Scorer: 3-component (0.385×Uptime + 0.385×Latency + 0.230×Jitter), grades A-F

**Dashboard (6 files):**
- Next.js 14 placeholder — "Dashboard coming in Sprint 2"

**Port changes vs plan:**
- Runner: :8081 → :9090
- API: :3000 → :8000
- Dashboard: :3002 → :3000
- PostgreSQL Docker: host port :5433 (avoid conflict with local PG 18)

**E2E Verified:**
- Create provider → proxy → run → start → Runner tests → samples in DB → summary computed → stop → completed
- Status flow: pending → running → stopping → completed
- All 7 DB tables populated, scoring working

---

### v4.0 — Sprint 2 Implementation Complete

**Toàn bộ Sprint 2 (Dashboard UI) đã implement và E2E verified với real proxies.**

**Dashboard (47 new files):**
- Project setup: Tailwind CSS 3.4, PostCSS, globals.css, multi-stage Dockerfile
- Layout: Fixed sidebar with 3 nav items (Overview, Providers, Test Runs)
- 11 UI components: Button (4 variants), Badge (6 variants + pulse), Card, Input, Select, Table (generic), Modal (ESC + click outside), ConfirmDialog, LoadingSpinner, ErrorAlert, EmptyState
- API client: Fetch wrapper with timeout, error classification (4xx/5xx/timeout/unreachable), suppressNotFound option, structured console.* logging
- TypeScript types: Provider, Proxy, TestRun, RunSummary, HttpSample, RunConfig + helpers (getScoreColor, getScoreGrade, formatDuration)
- 5 hooks: usePolling (generic interval), useProviders (CRUD), useProxies (CRUD + password_changed), useRuns (status filter), useRunDetail (parallel fetch + stopRun)
- Providers page: Table with inline expandable proxy rows (ProviderRow sub-component using React Fragment), add/edit/delete modals
- Proxies: CRUD forms, password masking ("Leave blank to keep"), grouped by provider
- Start test: 3-step modal (select proxies → configure RPM/timeout → create runs + trigger → redirect)
- Runs list: Status filter tabs (All/Running/Stopping/Completed/Failed), auto-poll 5s, Suspense boundary for useSearchParams
- Run detail: Realtime polling 3s, 4 summary cards (Score/Latency/Uptime/Samples), percentiles table, protocol breakdown, scoring breakdown, HTTP samples table with filter
- Overview: 3 stat cards (Providers/Proxies/Active Tests with pulse), active runs list, recent results

**API fixes (3 files modified):**
- Added CORS middleware (`cors` package) for Dashboard :3000 → API :8000
- Added proxy_label + provider_name JOINs to GET /runs and GET /runs/:id
- Added `@types/cors` dev dependency

**Runner fix (1 file modified):**
- HTTPS tester: Handle target URLs without explicit port (net.SplitHostPort fallback for ngrok/external URLs — default :443 for HTTPS, :80 for HTTP)

**E2E Verified with real proxies:**
- Provider: TunProxy (tunproxy.com), 2 VN residential proxies
- HTTP: 200 OK, TTFB ~300ms
- HTTPS: CONNECT tunnel success, TLS 1.3, total ~600-1000ms
- Target exposed via ngrok tunnel
- Both proxies running in parallel confirmed

---

### v2.1 — Project Structure Tree Update

### Fixed
- **Section 1 tree**: Expanded from ~30 files to ~121 files — full listing of all services
- **Dashboard**: Added all 75 files (was 4): layout, error boundary, 11 UI components, 8 chart components, 3 compare components, 3 provider components, 4 proxy components, 3 test components, 14 run components, 3 overview components, 10 hooks, 2 lib files, types
- **API**: Added `logger.ts`, `routes/index.ts`, `services/exportService.ts` (was missing 3 files)
- **Target**: Fixed `certs/` location (sibling of `src/`, not nested), added `generate-cert.sh`
- **Runner**: Added `go.sum`, enriched comments on ipcheck/scoring/engine files
- **Root**: Added `.gitignore`
- **CLAUDE.md**: Updated directory section with file counts + reference to full tree

---

## Files

| File | Mô tả |
|------|-------|
| `requirements/PROXY-TEST-PLAN.md` | Plan implementation chi tiết (v1.2) |
| `requirements/PLAN-EXPLANATION.md` | Giải thích plan tổng |
| `requirements/sprint-1/SPRINT-1-PLAN.md` | Sprint 1 chi tiết — 9 tasks + acceptance criteria |
| `requirements/sprint-1/SPRINT-1-EXPLANATION.md` | Giải thích Sprint 1 |
| `requirements/sprint-2/SPRINT-2-PLAN.md` | Sprint 2 chi tiết — 9 tasks + acceptance criteria |
| `requirements/sprint-2/SPRINT-2-EXPLANATION.md` | Giải thích Sprint 2 |
| `requirements/sprint-3/SPRINT-3-PLAN.md` | Sprint 3 chi tiết — 9 tasks + acceptance criteria |
| `requirements/sprint-3/SPRINT-3-EXPLANATION.md` | Giải thích Sprint 3 |
| `requirements/sprint-4/SPRINT-4-PLAN.md` | Sprint 4 chi tiết — 8 tasks + acceptance criteria |
| `requirements/sprint-4/SPRINT-4-EXPLANATION.md` | Giải thích Sprint 4 |
| `changelog/CHANGELOG.md` | File này — ghi lại quá trình |
