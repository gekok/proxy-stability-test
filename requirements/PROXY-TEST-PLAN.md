# Proxy Stability Test System — Implementation Plan (v2)

> **Mục tiêu**: Đánh giá **độ ổn định + bảo mật + chất lượng** của **static residential proxy** (HTTP/HTTPS + WebSocket) để chọn nhà cung cấp proxy tốt nhất cho hệ thống quản lý tài khoản Zalo.

| Field | Value |
|-------|-------|
| Date | 2026-02-24 (updated 2026-02-26) |
| Status | Sprint 1-3 Done, Sprint 4 Not Started |
| Tech Stack | Go (Runner) + Node.js/TypeScript (API, Target, Dashboard) + PostgreSQL |
| Deploy | Local only (Docker Compose) |
| Scale | 10 proxies / 10 providers song song, 1000 requests/min/proxy |

---

## 1. Project Structure (Monorepo)

```
proxy-stability-test/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CLAUDE.md
│
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── schema.sql                      # Full consolidated schema
│
├── runner/                             # Go — long-running process, nhận lệnh từ API
│   ├── cmd/
│   │   └── runner/
│   │       └── main.go                 # Start HTTP server chờ lệnh + (optional) CLI mode
│   ├── internal/
│   │   ├── server/
│   │   │   └── handler.go              # HTTP endpoint nhận trigger từ API
│   │   ├── config/
│   │   │   └── config.go               # Config parser (từ DB hoặc YAML fallback)
│   │   ├── proxy/
│   │   │   ├── dialer.go               # TCP connect qua proxy
│   │   │   ├── http_tester.go          # Plain HTTP test (goroutine riêng)
│   │   │   ├── https_tester.go         # HTTPS qua CONNECT tunnel (goroutine riêng)
│   │   │   ├── ws_tester.go            # WebSocket test ws + wss (1 goroutine)
│   │   │   └── tls_inspector.go        # TLS version/cipher
│   │   ├── ipcheck/                    # Sprint 3
│   │   │   ├── blacklist.go            # DNSBL lookup (4 servers)
│   │   │   └── geoip.go               # Geo verification (ip-api.com)
│   │   ├── engine/
│   │   │   ├── orchestrator.go         # Rate control, warmup, phased execution, burst test
│   │   │   ├── scheduler.go            # Parallel multi-proxy scheduling (max 10)
│   │   │   └── result_collector.go     # Aggregate samples, compute summary
│   │   ├── reporter/
│   │   │   ├── api_reporter.go         # POST kết quả tới Controller API
│   │   │   └── db_reporter.go          # Insert trực tiếp vào PostgreSQL
│   │   ├── scoring/
│   │   │   └── scorer.go               # Tính điểm tổng hợp (5 components, weight redistribution)
│   │   └── domain/
│   │       └── types.go                # Shared structs (HttpSample, WSSample, IPCheckResult...)
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── api/                                # Node.js/TypeScript — Controller API
│   ├── src/
│   │   ├── index.ts                    # Express app setup, mount routes, pino-http middleware
│   │   ├── logger.ts                   # pino logger { service: "api" }
│   │   ├── db/
│   │   │   └── pool.ts                 # PostgreSQL connection pool (pg)
│   │   ├── routes/
│   │   │   ├── index.ts               # Route registration (mount all route files)
│   │   │   ├── providers.ts            # CRUD /api/v1/providers
│   │   │   ├── proxies.ts             # CRUD /api/v1/proxies
│   │   │   ├── runs.ts                # CRUD /api/v1/runs + trigger Runner + stop
│   │   │   ├── results.ts            # GET samples, summary, ip-checks
│   │   │   └── export.ts              # Sprint 4: GET /runs/:id/export, GET /providers/compare
│   │   ├── services/
│   │   │   ├── runService.ts           # Run lifecycle, trigger, status management
│   │   │   ├── scoringService.ts       # Score computation helpers
│   │   │   └── exportService.ts        # Sprint 4: JSON/CSV export, provider comparison
│   │   ├── middleware/
│   │   │   ├── pagination.ts           # Cursor-based pagination (base64 cursor)
│   │   │   └── errorHandler.ts         # Global error handler, structured error responses
│   │   └── types/
│   │       └── index.ts                # Shared TypeScript types (Provider, Proxy, TestRun, RunSummary...)
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── target/                             # Node.js/TypeScript — Self-hosted Target Service
│   ├── src/
│   │   ├── index.ts                    # Start HTTP (:3001) + HTTPS (:3443) servers
│   │   ├── routes/
│   │   │   ├── echo.ts                 # ALL methods: GET/POST/PUT/PATCH/DELETE/HEAD /echo
│   │   │   ├── ip.ts                   # GET/HEAD /ip — trả IP client thấy
│   │   │   ├── large.ts                # GET /large?size=N — bandwidth test
│   │   │   ├── slow.ts                 # GET /slow?delay=N — timeout test
│   │   │   └── health.ts              # GET /health
│   │   └── ws/
│   │       └── wsEcho.ts               # WebSocket echo + ping/pong + hold duration
│   ├── certs/                          # Self-signed TLS cert cho HTTPS testing
│   │   ├── generate-cert.sh            # Script tạo self-signed cert (openssl)
│   │   ├── server.key
│   │   └── server.crt
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── dashboard/                          # Next.js 14 — Dashboard UI
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── .env.local.example              # API_URL=http://localhost:3000
│   ├── package.json                    # Dependencies: react, next, tailwindcss, recharts
│   ├── tsconfig.json
│   ├── Dockerfile
│   │
│   └── src/
│       ├── app/                        # Next.js App Router pages
│       │   ├── layout.tsx              # Root layout: Sidebar + main content area
│       │   ├── globals.css             # Tailwind base styles
│       │   ├── error.tsx               # Global error boundary
│       │   ├── page.tsx                # Overview (stat cards, active runs, recent results)
│       │   ├── providers/
│       │   │   └── page.tsx            # Provider list + proxy management
│       │   ├── runs/
│       │   │   ├── page.tsx            # Runs list with status filter tabs
│       │   │   └── [runId]/
│       │   │       └── page.tsx        # Run detail: summary, charts, samples, errors
│       │   └── compare/
│       │       └── page.tsx            # Sprint 4: Provider comparison (radar chart)
│       │
│       ├── lib/                        # Shared utilities
│       │   ├── logger.ts               # pino logger { service: "dashboard" } + console helpers
│       │   └── api-client.ts           # Fetch wrapper: base URL, error handling, 9 log points
│       │
│       ├── types/
│       │   └── index.ts                # TypeScript types matching API/DB schema
│       │
│       ├── hooks/                      # React custom hooks
│       │   ├── usePolling.ts           # Generic polling hook (interval, pause/resume, cleanup)
│       │   ├── useProviders.ts         # CRUD providers + polling
│       │   ├── useProxies.ts           # CRUD proxies by provider
│       │   ├── useRuns.ts              # Fetch runs + WS samples + IP checks
│       │   ├── useRunDetail.ts         # Single run detail + summary + samples polling
│       │   ├── useChartData.ts         # Sprint 4: time-bucket aggregation for charts
│       │   ├── useSummaryHistory.ts    # Sprint 4: sliding window 200 summary snapshots
│       │   ├── useCompare.ts           # Sprint 4: provider comparison data
│       │   ├── useExport.ts            # Sprint 4: blob download (JSON/CSV)
│       │   └── useErrorLogs.ts         # Sprint 4: fetch + merge + filter error logs
│       │
│       └── components/
│           ├── layout/
│           │   └── Sidebar.tsx          # Navigation sidebar (Overview, Providers, Runs, Compare)
│           │
│           ├── ui/                      # Reusable UI components (11)
│           │   ├── Button.tsx
│           │   ├── Badge.tsx
│           │   ├── Card.tsx
│           │   ├── Input.tsx
│           │   ├── Select.tsx
│           │   ├── Table.tsx            # Generic table: columns, custom renderers, loading skeleton
│           │   ├── LoadingSpinner.tsx    # SVG spinner (sm/md/lg)
│           │   ├── ErrorAlert.tsx        # Red alert box + optional retry button
│           │   ├── EmptyState.tsx        # Empty state with optional action button
│           │   ├── Modal.tsx            # Modal dialog wrapper
│           │   └── ConfirmDialog.tsx     # Destructive action confirmation
│           │
│           ├── providers/               # Provider management
│           │   ├── ProviderList.tsx      # Provider table + add button
│           │   ├── ProviderForm.tsx      # Add/edit provider modal form
│           │   └── DeleteProviderDialog.tsx
│           │
│           ├── proxies/                 # Proxy management (grouped by provider)
│           │   ├── ProxyList.tsx         # Proxy table per provider
│           │   ├── ProxyForm.tsx         # Add/edit proxy (password: create/change/never-return)
│           │   ├── ProxyCard.tsx         # Proxy summary card
│           │   └── DeleteProxyDialog.tsx
│           │
│           ├── test/                    # Start test flow
│           │   ├── ProxySelector.tsx     # Multi-select proxy list (checkboxes)
│           │   ├── TestConfigForm.tsx    # RPM, timeout, warmup config fields
│           │   └── StartTestDialog.tsx   # 3-step dialog: select → configure → confirm
│           │
│           ├── runs/                    # Run list + detail components (14)
│           │   ├── RunsList.tsx          # Runs table with status column
│           │   ├── RunsFilter.tsx        # Status filter tabs (All/Running/Completed/Failed)
│           │   ├── RunStatusBadge.tsx    # Color-coded status badge with pulse animation
│           │   ├── RunHeader.tsx         # Run title, status, duration, Stop/Export buttons
│           │   ├── RunSummaryCards.tsx   # 4-6 summary metric cards (uptime, latency, score...)
│           │   ├── RunMetricsDetail.tsx  # Detailed percentile tables (HTTP + WS)
│           │   ├── RunHttpSamples.tsx    # Paginated HTTP/HTTPS sample list
│           │   ├── RunWSSamples.tsx      # Sprint 3: WS sample list with connection lifecycle
│           │   ├── RunIPCheck.tsx        # Sprint 3: IP check results (blacklist, geo, stability)
│           │   ├── RunScoreBreakdown.tsx # Sprint 3: 5-component score breakdown display
│           │   ├── StopTestButton.tsx    # Stop button with confirmation dialog
│           │   ├── ExportButton.tsx      # Sprint 4: Dropdown (JSON/CSV) with loading spinner
│           │   ├── ErrorLogViewer.tsx    # Sprint 4: Expandable error rows, color-coded by source
│           │   └── ErrorLogFilters.tsx   # Sprint 4: Filter by source/error_type/protocol
│           │
│           ├── compare/                 # Sprint 4: Provider comparison
│           │   ├── ProviderSelect.tsx    # Multi-select provider dropdown (min 2, max 5)
│           │   ├── RadarCompareChart.tsx # 5-axis radar chart (recharts)
│           │   └── ComparisonTable.tsx   # Side-by-side metrics table
│           │
│           ├── charts/                  # Sprint 4: Data visualization (recharts)
│           │   ├── ChartContainer.tsx    # Responsive wrapper + empty state handling
│           │   ├── ChartTooltip.tsx      # Shared tooltip component
│           │   ├── ChartErrorBoundary.tsx # React error boundary for chart crashes
│           │   ├── chart-utils.ts       # CHART_COLORS, formatMs, gradeColor, bucketByTime, percentile
│           │   ├── LatencyChart.tsx      # LineChart: P50/P95/P99 over time
│           │   ├── UptimeTimeline.tsx    # AreaChart: stacked success/error + uptime ratio
│           │   ├── ScoreGauge.tsx        # RadialBarChart: score + grade display
│           │   └── ScoreHistoryChart.tsx # LineChart: score over time + grade threshold bands
│           │
│           └── overview/                # Overview page components
│               ├── StatCards.tsx         # 3 stat cards (total providers, active runs, avg score)
│               ├── ActiveRunsList.tsx    # Currently running tests list
│               └── RecentResultsList.tsx # Recent completed results
│
└── configs/                            # Sample YAML configs (cho advanced CLI mode)
    ├── single-proxy.yaml
    └── multi-proxy.yaml
```

> **File counts**: Runner ~16 files, API ~15 files, Target ~13 files, Dashboard ~75 files, Database 2 files = **~121 files total**.

---

## 2. Architecture Overview

```
┌──────────────┐      ┌─────────────────┐      ┌──────────────┐
│  Dashboard   │─────▶│ Controller API  │─────▶│  Go Runner   │
│  (Next.js)   │      │ (Node.js/TS)    │      │  (long-run   │
│              │      │                 │◀─────│   process)   │
│ Nhập proxy   │      │ Quản lý data    │      │  Test proxy  │
│ Bấm Run Test │      │ Trigger runner  │      │  Gửi kết quả │
│ Xem kết quả  │      │ Trả report      │      │  về API      │
└──────────────┘      └────────┬────────┘      └──────┬───────┘
                               │                       │
                        ┌──────▼──────┐          ┌─────▼──────┐
                        │  PostgreSQL │          │   Proxy    │
                        └─────────────┘          └─────┬──────┘
                                                       │
                                                 ┌─────▼──────┐
                                                 │  Target    │
                                                 │  Service   │
                                                 └────────────┘
```

### 2.1 Input Method: Dashboard UI (primary)

> **Anh KHÔNG cần biết YAML**. Tất cả nhập liệu qua Dashboard UI.
> Số lượng proxy linh hoạt: 1, 3, 5, 10 — tuỳ anh.

### 2.2 User Flow (từ đầu tới cuối)

```
Bước 1: Nhập Provider
  Dashboard UI → form "Thêm nhà cung cấp"
  Anh nhập: Tên (VD: "BrightData"), Website, Ghi chú
  → Bấm Save → API tạo record trong DB

Bước 2: Nhập Proxy cho mỗi Provider
  Dashboard UI → form "Thêm Proxy"
  Anh nhập: Host, Port, Username, Password, Quốc gia mong đợi
  → Hệ thống tự format + lưu (password encrypt, không hiện lại)
  → Có thể nhập 1 proxy cho 1 provider, hoặc nhiều

Bước 3: Bấm "Start Test"
  Dashboard UI → chọn proxies muốn test (tick chọn) → bấm "Start Test"
  → Tuỳ chọn: chọn 1 proxy, 3 proxy, hoặc tất cả
  → Tuỳ chọn: điều chỉnh RPM (default 1000), timeout...
  → API tạo test_run records + gọi Runner

Bước 4: Hệ thống TỰ CHẠY LIÊN TỤC (không cần làm gì)
  Runner tự động:
  ├── Nhận danh sách proxy cần test từ API
  ├── Test song song tất cả proxy được chọn
  ├── Gửi kết quả realtime về API (batch mỗi 50 samples)
  ├── Tính summary mỗi 30 giây → Dashboard update realtime
  └── CHẠY MÃI cho đến khi user bấm "Stop" hoặc tắt Docker

Bước 5: Xem kết quả REALTIME (trong khi test đang chạy)
  Dashboard UI → tự refresh kết quả mỗi vài giây
  → Xem score, latency chart, uptime cập nhật liên tục
  → Càng chạy lâu → data càng chính xác (nhiều samples hơn)

Bước 6: Bấm "Stop Test" khi đã đủ data
  Dashboard UI → bấm "Stop Test" (hoặc tắt Docker)
  → Runner dừng gửi request, tính summary cuối cùng
  → Status chuyển sang "completed"
  → Kết quả cuối cùng lưu vĩnh viễn trong DB
```

### 2.3 Data flow (technical)

1. User nhập Provider + Proxy qua **Dashboard UI** → API lưu vào PostgreSQL
2. User bấm "Start Test" → API tạo `test_run` records → trigger Go Runner
3. Runner nhận proxy list từ API → test song song (1000 RPM/proxy)
4. Mỗi proxy: Runner → Proxy → Target Service → Proxy → Runner
5. Runner gửi kết quả (batch) về API → API lưu vào PostgreSQL
6. Runner tính summary mỗi 30 giây → Dashboard cập nhật realtime
7. **Chạy liên tục** cho đến khi user bấm "Stop Test" hoặc tắt Docker
8. Khi Stop → Runner dừng gracefully → tính summary cuối → status = completed

### 2.4 Runner là gì? Ai khởi động nó?

Runner là 1 **long-running process** chạy cùng Docker Compose.
- Khi `docker compose up` → Runner process start và **chờ lệnh**
- Khi user bấm "Start Test" trên Dashboard → API gửi signal tới Runner
- Runner nhận lệnh → **chạy test liên tục** → gửi kết quả realtime
- Khi user bấm "Stop Test" → API gửi stop signal → Runner dừng gracefully
- User KHÔNG cần mở terminal hay gõ lệnh gì

### 2.5 Test chạy đến khi nào?

| Cách dừng | Cơ chế |
|-----------|--------|
| **Bấm "Stop Test"** trên Dashboard | API gửi `PATCH /runs/:id/status` → `stopping` → Runner nhận signal, dừng sau batch hiện tại, tính summary cuối |
| **Tắt Docker** (`docker compose down`) | Runner nhận SIGTERM → graceful shutdown → tính summary cuối → lưu DB |
| **Đóng browser** | Test **VẪN CHẠY** — Runner độc lập với browser. Mở lại browser → vẫn thấy test đang chạy |
| **Mất kết nối mạng** | Runner phát hiện → đánh dấu samples là error → tiếp tục retry khi mạng hồi |

**Graceful stop flow**:
```
User bấm "Stop Test"
  → Dashboard gọi: PATCH /api/v1/runs/:id/status  { status: "stopping" }
  → API cập nhật DB: status = "stopping"
  → Runner đang chạy → kiểm tra status mỗi batch
  → Thấy "stopping" → dừng gửi request mới
  → Chờ requests đang bay hoàn thành (max 10 giây)
  → Tính summary cuối cùng từ TẤT CẢ samples
  → Cập nhật: status = "completed", stopped_at = now()
  → Dashboard hiện kết quả cuối cùng
```

> YAML config vẫn tồn tại nhưng chỉ dùng cho **advanced users** muốn chạy CLI trực tiếp.
> Flow chính là: **Dashboard UI → API → Runner → kết quả tự về Dashboard**.

---

## 3. Data Model (PostgreSQL)

### Đã fix tất cả issues từ review trước:
- ❌ `dns_ms` → removed (client không đo được DNS target qua proxy)
- ✅ `ws_sample` thêm: `started_at`, `connection_held_ms`, `disconnect_reason`
- ✅ `run_summary` thêm: `tls_p50/p95/p99`
- ✅ `is_warmup` flag trên tất cả sample tables
  > Warmup filtering: Runner sets `is_warmup=true` on warmup samples. API excludes `is_warmup=true` when computing `run_summary` aggregates. Both layers filter.
- ✅ `auth_pass_enc` password encrypted (AES-256-GCM) trong DB, nhập qua Dashboard UI
- ✅ Thêm `ip_check_result` table

```sql
-- =============================================================
-- proxy-stability-test: Full Database Schema
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. provider
CREATE TABLE IF NOT EXISTS provider (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    website         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. proxy_endpoint
CREATE TABLE IF NOT EXISTS proxy_endpoint (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id     UUID NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    host            TEXT NOT NULL,
    port            INT NOT NULL,
    protocol        TEXT NOT NULL DEFAULT 'http'
                    CHECK (protocol IN ('http', 'https', 'socks5')),
    -- 'https' = proxy speaks native HTTPS (rare). Most HTTPS proxying uses protocol='http' + CONNECT tunnel.
    -- Dashboard UI shows 'http' and 'socks5' as primary options.
    auth_user       TEXT,
    auth_pass_enc   TEXT,            -- password encrypted (AES-256-GCM), nhập qua UI
    -- Encryption key: env var `ENCRYPTION_KEY` (32 bytes, hex-encoded).
    -- Generate: `openssl rand -hex 32`
    -- Set in docker-compose.yml: `ENCRYPTION_KEY: ${ENCRYPTION_KEY}`
    expected_country TEXT,
    expected_city   TEXT,
    is_dedicated    BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proxy_endpoint_provider ON proxy_endpoint(provider_id);

-- 3. test_run
CREATE TABLE IF NOT EXISTS test_run (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proxy_id                UUID NOT NULL REFERENCES proxy_endpoint(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','cancelled','stopping')),
    run_mode                TEXT NOT NULL DEFAULT 'continuous'
                            CHECK (run_mode IN ('continuous', 'fixed')),
    -- continuous: chạy cho đến khi user bấm Stop hoặc tắt tool
    -- fixed: chạy đúng N requests rồi dừng (optional, cho advanced)

    config_snapshot         JSONB NOT NULL DEFAULT '{}',
    target_endpoints        JSONB NOT NULL DEFAULT '[]',

    -- Timeout configs
    request_timeout_ms      INT NOT NULL DEFAULT 10000,
    ws_connect_timeout_ms   INT NOT NULL DEFAULT 5000,
    ws_hold_duration_ms     INT NOT NULL DEFAULT 60000,

    -- Rate control (tổng HTTP+HTTPS = 1000 RPM mặc định)
    http_rpm                INT NOT NULL DEFAULT 500,    -- plain HTTP goroutine RPM
    https_rpm               INT NOT NULL DEFAULT 500,    -- HTTPS goroutine RPM
    ws_messages_per_minute  INT NOT NULL DEFAULT 60,
    warmup_requests         INT NOT NULL DEFAULT 5,

    -- Summary interval: tính summary mỗi N giây (realtime update trên Dashboard)
    summary_interval_sec    INT NOT NULL DEFAULT 30,

    total_http_samples      INT NOT NULL DEFAULT 0,     -- plain HTTP sample count
    total_https_samples     INT NOT NULL DEFAULT 0,    -- HTTPS sample count
    total_ws_samples        INT NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ,
    stopped_at              TIMESTAMPTZ,           -- khi user bấm Stop
    finished_at             TIMESTAMPTZ,
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_run_proxy ON test_run(proxy_id);
CREATE INDEX IF NOT EXISTS idx_test_run_status ON test_run(status);

-- 4. http_sample
CREATE TABLE IF NOT EXISTS http_sample (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    seq             INT NOT NULL,
    is_warmup       BOOLEAN NOT NULL DEFAULT false,
    target_url      TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'GET',     -- GET/POST/PUT/PATCH/DELETE/HEAD
    is_https        BOOLEAN NOT NULL DEFAULT false,  -- true = HTTPS goroutine, false = HTTP goroutine

    status_code     INT,
    error_type      TEXT,            -- timeout, connection_refused, proxy_auth_failed, connect_tunnel_failed, tls_handshake_failed, tls_cert_expired...
    error_message   TEXT,

    -- Timing (ms) — KHÔNG có dns_ms vì client không đo được DNS target qua proxy
    tcp_connect_ms      DOUBLE PRECISION,
    tls_handshake_ms    DOUBLE PRECISION,    -- chỉ HTTPS
    ttfb_ms             DOUBLE PRECISION,
    total_ms            DOUBLE PRECISION,

    tls_version     TEXT,
    tls_cipher      TEXT,

    bytes_sent      BIGINT DEFAULT 0,
    bytes_received  BIGINT DEFAULT 0,
    measured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_http_sample_run ON http_sample(run_id);

-- 5. ws_sample — thêm started_at, connection_held_ms, disconnect_reason
CREATE TABLE IF NOT EXISTS ws_sample (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id              UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    seq                 INT NOT NULL,
    is_warmup           BOOLEAN NOT NULL DEFAULT false,
    target_url          TEXT NOT NULL,

    connected           BOOLEAN NOT NULL DEFAULT false,
    error_type          TEXT,
    error_message       TEXT,

    tcp_connect_ms      DOUBLE PRECISION,
    tls_handshake_ms    DOUBLE PRECISION,
    handshake_ms        DOUBLE PRECISION,
    message_rtt_ms      DOUBLE PRECISION,

    -- Keep-alive metrics
    started_at          TIMESTAMPTZ,
    connection_held_ms  DOUBLE PRECISION,
    disconnect_reason   TEXT,            -- client_close, server_close, proxy_close, pong_timeout, timeout, error

    messages_sent       INT NOT NULL DEFAULT 0,
    messages_received   INT NOT NULL DEFAULT 0,
    drop_count          INT NOT NULL DEFAULT 0,
    measured_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_sample_run ON ws_sample(run_id);

-- 6. ip_check_result — IP reputation + geo verification
CREATE TABLE IF NOT EXISTS ip_check_result (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    proxy_id        UUID NOT NULL REFERENCES proxy_endpoint(id) ON DELETE CASCADE,

    observed_ip         INET NOT NULL,

    expected_country    TEXT,
    actual_country      TEXT,
    actual_region       TEXT,
    actual_city         TEXT,
    geo_match           BOOLEAN,

    blacklist_checked   BOOLEAN NOT NULL DEFAULT false,
    blacklists_queried  INT NOT NULL DEFAULT 0,
    blacklists_listed   INT NOT NULL DEFAULT 0,
    blacklist_sources   JSONB DEFAULT '[]',
    is_clean            BOOLEAN,

    ip_stable           BOOLEAN,
    ip_changes          INT NOT NULL DEFAULT 0,
    checked_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_check_run ON ip_check_result(run_id);

-- 7. run_summary — thêm TLS p50/p95/p99
CREATE TABLE IF NOT EXISTS run_summary (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID NOT NULL UNIQUE REFERENCES test_run(id) ON DELETE CASCADE,
    proxy_id        UUID NOT NULL REFERENCES proxy_endpoint(id) ON DELETE CASCADE,

    http_sample_count   INT NOT NULL DEFAULT 0,       -- plain HTTP samples
    https_sample_count  INT NOT NULL DEFAULT 0,       -- HTTPS samples
    ws_sample_count     INT NOT NULL DEFAULT 0,

    -- Uptime (HTTP + HTTPS combined)
    http_success_count  INT NOT NULL DEFAULT 0,       -- HTTP + HTTPS successes
    http_error_count    INT NOT NULL DEFAULT 0,       -- HTTP + HTTPS errors
    uptime_ratio        DOUBLE PRECISION,

    -- Latency (TTFB, excluding warmup)
    ttfb_avg_ms         DOUBLE PRECISION,
    ttfb_p50_ms         DOUBLE PRECISION,
    ttfb_p95_ms         DOUBLE PRECISION,
    ttfb_p99_ms         DOUBLE PRECISION,
    ttfb_max_ms         DOUBLE PRECISION,

    -- Total request duration
    total_avg_ms        DOUBLE PRECISION,
    total_p50_ms        DOUBLE PRECISION,
    total_p95_ms        DOUBLE PRECISION,
    total_p99_ms        DOUBLE PRECISION,

    -- Jitter
    jitter_ms           DOUBLE PRECISION,

    -- TLS handshake percentiles
    tls_p50_ms          DOUBLE PRECISION,
    tls_p95_ms          DOUBLE PRECISION,
    tls_p99_ms          DOUBLE PRECISION,

    -- TCP connect percentiles
    tcp_connect_p50_ms  DOUBLE PRECISION,
    tcp_connect_p95_ms  DOUBLE PRECISION,
    tcp_connect_p99_ms  DOUBLE PRECISION,

    -- WebSocket
    ws_success_count    INT NOT NULL DEFAULT 0,
    ws_error_count      INT NOT NULL DEFAULT 0,
    ws_rtt_avg_ms       DOUBLE PRECISION,
    ws_rtt_p95_ms       DOUBLE PRECISION,
    ws_drop_rate        DOUBLE PRECISION,
    ws_avg_hold_ms      DOUBLE PRECISION,

    -- Throughput
    total_bytes_sent        BIGINT DEFAULT 0,
    total_bytes_received    BIGINT DEFAULT 0,
    avg_throughput_bps      DOUBLE PRECISION,

    -- IP / Security
    ip_clean            BOOLEAN,
    ip_geo_match        BOOLEAN,
    ip_stable           BOOLEAN,

    -- Scoring
    score_uptime        DOUBLE PRECISION,
    score_latency       DOUBLE PRECISION,
    score_jitter        DOUBLE PRECISION,
    score_ws            DOUBLE PRECISION,
    score_security      DOUBLE PRECISION,
    score_total         DOUBLE PRECISION,

    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_summary_proxy ON run_summary(proxy_id);
CREATE INDEX IF NOT EXISTS idx_run_summary_score ON run_summary(score_total DESC);
```

---

## 4. Go Runner — Thiết kế chi tiết

### 4.1 Test Phases (tuần tự cho mỗi proxy)

```
Phase 0: Connectivity Check
  ├── TCP connect tới proxy host:port
  ├── Authenticate (nếu user/pass)
  └── Record: connect_ms, auth_success

Phase 1: IP Verification
  ├── GET qua proxy tới /ip endpoint → lấy observed IP
  ├── DNSBL blacklist lookup (Spamhaus, Barracuda, SpamCop, SORBS)
  ├── Geo-IP lookup → so sánh actual vs expected country
  └── Record: ip_check_result

Phase 2: Warmup (HTTP/HTTPS)
  ├── Gửi warmup_requests requests → is_warmup = true
  └── Mục đích: warm connection pool, tránh cold-start bias

Phase 3: CONTINUOUS — 4 goroutines SONG SONG (chạy đến khi Stop)

  Trên 1 proxy, 4 goroutines chạy đồng thời:

  ┌───────────────────────────────────────────────────────────────────────┐
  │                   PROXY A — 4 goroutines song song                    │
  │                                                                        │
  │  ┌─── Goroutine 1: HTTP (plain) ──────────────────────────────────┐   │
  │  │  Mục đích: Test plain HTTP qua proxy (không TLS)                │   │
  │  │  Rate: http_rpm (default 500 RPM, token bucket)                 │   │
  │  │                                                                  │   │
  │  │  loop:                                                          │   │
  │  │    Xoay vòng HTTP methods theo thứ tự:                         │   │
  │  │      GET  /echo        — basic request, đo TTFB                │   │
  │  │      POST /echo        — gửi JSON body, đo throughput          │   │
  │  │      PUT  /echo        — gửi body update, đo throughput        │   │
  │  │      PATCH /echo       — gửi partial body                      │   │
  │  │      DELETE /echo      — xoá resource                          │   │
  │  │      HEAD /echo        — chỉ headers, không body               │   │
  │  │      GET  /large?size=N — đo bandwidth (mỗi 10 requests)      │   │
  │  │      GET  /slow?delay=N — đo timeout handling (mỗi 10 req)    │   │
  │  │    httptrace: tcp_connect, ttfb, total (KHÔNG có tls vì HTTP)  │   │
  │  │    Record: http_sample (method=GET/POST/PUT/...)               │   │
  │  │    Mỗi 30s: re-check IP stability qua GET /ip                 │   │
  │  │    Mỗi 5 phút: concurrency burst (100 goroutines, GET /echo)  │   │
  │  │    Check: status == "stopping"? → break                        │   │
  │  └──────────────────────────────────────────────────────────────┘   │
  │                                                                        │
  │  ┌─── Goroutine 2: HTTPS (qua CONNECT tunnel) ────────────────────┐   │
  │  │  Mục đích: Test HTTPS qua CONNECT tunnel (TLS end-to-end)      │   │
  │  │  Rate: https_rpm (default 500 RPM, token bucket)                │   │
  │  │                                                                  │   │
  │  │  loop:                                                          │   │
  │  │    Mỗi request đi qua 3 giai đoạn:                             │   │
  │  │      1. CONNECT tunnel tới proxy                                │   │
  │  │      2. TLS handshake trong tunnel                              │   │
  │  │      3. HTTPS request (encrypted)                               │   │
  │  │    Xoay vòng HTTPS methods theo thứ tự:                        │   │
  │  │      GET  https://target:3443/echo    — basic HTTPS             │   │
  │  │      POST https://target:3443/echo    — gửi JSON body          │   │
  │  │      PUT  https://target:3443/echo    — gửi body update        │   │
  │  │      PATCH https://target:3443/echo   — partial body            │   │
  │  │      DELETE https://target:3443/echo  — xoá resource            │   │
  │  │      HEAD https://target:3443/echo    — chỉ headers             │   │
  │  │      GET  https://target:3443/large   — bandwidth qua TLS      │   │
  │  │    httptrace: tcp_connect, tls_handshake, ttfb, total          │   │
  │  │    Record: http_sample (method=GET/POST/..., tls_version, ...)  │   │
  │  │    Check: status == "stopping"? → break                        │   │
  │  └──────────────────────────────────────────────────────────────┘   │
  │                                                                        │
  │  ┌─── Goroutine 3: WebSocket (ws + wss) ───────────────────────────┐   │
  │  │  Mục đích: Test WS và WSS qua proxy                             │   │
  │  │                                                                  │   │
  │  │  loop:                                                          │   │
  │  │    Xen kẽ ws:// và wss:// connections:                          │   │
  │  │      ws://target:3001/ws-echo    — plain WebSocket              │   │
  │  │      wss://target:3443/ws-echo   — WebSocket qua CONNECT+TLS   │   │
  │  │    Open connection qua proxy                                     │   │
  │  │    Gửi echo messages (ws_messages_per_minute)                   │   │
  │  │    Giữ connection ws_hold_duration_ms                           │   │
  │  │    Record: ws_sample (handshake, RTT, hold, disconnect)         │   │
  │  │    Connection đóng → mở connection mới → lặp lại               │   │
  │  │    Check: status == "stopping"? → break                        │   │
  │  └──────────────────────────────────────────────────────────────┘   │
  │                                                                        │
  │  ┌─── Goroutine 4: Rolling Summary ────────────────────────────────┐   │
  │  │  loop (mỗi 30 giây):                                            │   │
  │  │    Tính percentiles từ non-warmup samples                       │   │
  │  │    Tính uptime_ratio, jitter, ws_drop_rate                      │   │
  │  │    Tính composite score                                          │   │
  │  │    Upsert: run_summary (Dashboard đọc realtime)                 │   │
  │  │    Check: status == "stopping"? → break                        │   │
  │  └──────────────────────────────────────────────────────────────┘   │
  │                                                                        │
  └───────────────────────────────────────────────────────────────────────┘

  → HTTP, HTTPS, WS chạy ĐỒNG THỜI trên cùng 1 proxy (3 luồng test + 1 luồng summary)
  → HTTP và HTTPS RIÊNG BIỆT: đo plain HTTP vs encrypted HTTPS độc lập
  → Mỗi loại (HTTP/HTTPS) test ĐẦY ĐỦ methods: GET, POST, PUT, PATCH, DELETE, HEAD
  → Phản ánh thực tế: hệ thống Zalo dùng cả HTTP + HTTPS + WS cùng lúc
  → Đo được: proxy có chịu được 4 goroutines song song không

  **Method rotation** (xoay vòng HTTP methods):
  ```
  Mỗi batch gồm 6 requests (1 per method):
    Request 1: GET /echo
    Request 2: POST /echo     body: {"test": true, "seq": N, "ts": ...}
    Request 3: PUT /echo      body: {"update": true, "seq": N, "ts": ...}
    Request 4: PATCH /echo    body: {"patch": "field_x", "seq": N}
    Request 5: DELETE /echo
    Request 6: HEAD /echo

  Xen kẽ thêm (mỗi 10 batches):
    GET /large?size=1048576    — đo bandwidth
    GET /slow?delay=2000       — đo timeout handling
    GET /ip                    — đo IP stability (mỗi 30s)
  ```

  **RPM split** (tổng 1000 RPM per proxy):
  ```
  http_rpm:   500  (plain HTTP goroutine)
  https_rpm:  500  (HTTPS goroutine)
  ws_mpm:      60  (WebSocket, messages per minute)
  → Tổng HTTP requests: 1000 RPM (500 HTTP + 500 HTTPS)
  → Configurable: có thể điều chỉnh tỷ lệ qua config
  ```

Phase 4: Final Summary (khi Stop)
  ├── Tất cả 4 goroutines nhận stop signal → dừng gửi request/message mới
  ├── Chờ requests/messages đang bay hoàn thành (max 10 giây)
  ├── Tính summary cuối cùng từ TẤT CẢ samples (HTTP + HTTPS + WS)
  ├── Upsert run_summary lần cuối
  ├── Update test_run: status = "completed", stopped_at = now()
  └── Log: final score + total duration + total samples (per goroutine + tổng)

### 4.2 Chi tiết Request/Response cho từng loại test

#### HTTP Test — Request & Response (Goroutine 1: plain HTTP)

> HTTP goroutine test **ĐẦY ĐỦ HTTP methods** để đánh giá proxy xử lý từng method như thế nào.
> Không qua CONNECT tunnel, không TLS — chỉ plain HTTP qua proxy.

**Method rotation** — Runner xoay vòng qua 6 methods:

```
── GET request (đo TTFB, basic connectivity) ──────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ GET http://target:3001/echo HTTP/1.1                    │
  │ Host: target:3001                                       │
  │ User-Agent: ProxyTester/1.0                             │
  │ X-Run-Id: abc-123                                       │
  │ X-Seq: 1                                                │
  │ X-Method-Test: GET                                      │
  └─────────────────────────────────────────────────────────┘
  Target trả về:
  ┌─────────────────────────────────────────────────────────┐
  │ HTTP/1.1 200 OK                                         │
  │ { "method": "GET", "body": null, "ts": "..." }          │
  └─────────────────────────────────────────────────────────┘

── POST request (đo throughput, gửi body) ─────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ POST http://target:3001/echo HTTP/1.1                   │
  │ Content-Type: application/json                          │
  │ { "test": true, "seq": 2, "ts": 1708770615123 }       │
  └─────────────────────────────────────────────────────────┘
  Target trả về: echo nguyên body

── PUT request (gửi full body update) ─────────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ PUT http://target:3001/echo HTTP/1.1                    │
  │ Content-Type: application/json                          │
  │ { "update": true, "seq": 3, "ts": 1708770615123 }     │
  └─────────────────────────────────────────────────────────┘

── PATCH request (gửi partial update) ─────────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ PATCH http://target:3001/echo HTTP/1.1                  │
  │ Content-Type: application/json                          │
  │ { "patch": "field_x", "seq": 4 }                      │
  └─────────────────────────────────────────────────────────┘

── DELETE request ─────────────────────────────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ DELETE http://target:3001/echo HTTP/1.1                 │
  │ X-Seq: 5                                                │
  └─────────────────────────────────────────────────────────┘
  Target trả về: { "method": "DELETE", "body": null }

── HEAD request (chỉ headers, không body) ─────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ HEAD http://target:3001/echo HTTP/1.1                   │
  │ X-Seq: 6                                                │
  └─────────────────────────────────────────────────────────┘
  Target trả về: headers only, no body (Content-Length vẫn có)

Runner đo (cho mọi method):
  • method          — GET/POST/PUT/PATCH/DELETE/HEAD
  • tcp_connect_ms  — thời gian TCP connect tới proxy
  • ttfb_ms         — thời gian nhận byte đầu tiên
  • total_ms        — tổng thời gian request
  • status_code     — 200 = OK
  • bytes_sent      — kích thước request body (0 cho GET/HEAD/DELETE)
  • bytes_received  — kích thước response (0 cho HEAD)
  • KHÔNG có tls_handshake_ms (vì plain HTTP)

Xen kẽ thêm (mỗi 10 batches):
  • GET /ip           — kiểm tra IP stability (mỗi 30s)
  • GET /large?size=N — đo bandwidth (body lớn)
  • GET /slow?delay=N — đo timeout handling
```

#### HTTPS Test — Request & Response (Goroutine 2: HTTPS qua CONNECT tunnel)

> HTTPS goroutine test **ĐẦY ĐỦ HTTP methods qua CONNECT tunnel + TLS**.
> Mỗi request đi qua 3 giai đoạn: CONNECT → TLS → HTTPS request.
> So với HTTP goroutine: thêm CONNECT tunnel + TLS handshake overhead.

**Giai đoạn 1+2** (giống cho mọi method):
```
Bước 1: Runner mở CONNECT tunnel qua Proxy
  ┌─────────────────────────────────────────────────────────┐
  │ CONNECT target:3443 HTTP/1.1                            │
  │ Host: target:3443                                       │
  │ Proxy-Authorization: Basic dXNlcjpwYXNz                │
  └─────────────────────────────────────────────────────────┘

Proxy trả về:
  ┌─────────────────────────────────────────────────────────┐
  │ HTTP/1.1 200 Connection Established                     │
  └─────────────────────────────────────────────────────────┘

Bước 2: Runner thực hiện TLS handshake TRONG tunnel
  Runner ←──TLS──→ Target (Proxy chỉ forward bytes, không đọc được)
```

**Giai đoạn 3** — Method rotation (xoay vòng 6 methods trong tunnel encrypted):
```
── GET request (qua HTTPS) ────────────────────────────────
  ┌─────────────────────────────────────────────────────────┐
  │ GET /echo HTTP/1.1                                      │
  │ Host: target:3443                                       │
  │ X-Run-Id: abc-123  │  X-Seq: 1                         │
  └─────────────────────────────────────────────────────────┘

── POST request (qua HTTPS, gửi body encrypted) ──────────
  ┌─────────────────────────────────────────────────────────┐
  │ POST /echo HTTP/1.1                                     │
  │ Content-Type: application/json                          │
  │ { "test": true, "seq": 2, "ts": 1708770615123 }       │
  └─────────────────────────────────────────────────────────┘

── PUT / PATCH / DELETE / HEAD (tương tự HTTP nhưng encrypted) ──
  Cùng format với HTTP goroutine, nhưng:
  • Tất cả đi qua CONNECT tunnel (encrypted)
  • Mỗi request có TLS overhead
  • Target URL: https://target:3443/echo (thay vì http://target:3001/echo)

Xen kẽ thêm (mỗi 10 batches):
  • GET https://target:3443/large?size=N — đo bandwidth qua TLS
```

**Runner đo (cho mọi method trong HTTPS goroutine)**:
```
  • method              — GET/POST/PUT/PATCH/DELETE/HEAD
  • tcp_connect_ms      — TCP tới proxy
  • tls_handshake_ms    — TLS handshake trong tunnel
  • tls_version         — "TLS 1.3"
  • tls_cipher          — "TLS_AES_128_GCM_SHA256"
  • ttfb_ms             — byte đầu tiên (sau TLS)
  • total_ms            — tổng thời gian (gồm CONNECT + TLS + HTTPS)
  • status_code         — 200
  • bytes_sent / bytes_received
```

#### WebSocket Test — Request & Response (Goroutine 3: WS + WSS)

> WS goroutine xen kẽ **ws://** (plain) và **wss://** (encrypted qua CONNECT tunnel).
> Mỗi connection trải qua: kết nối → gửi echo messages → keep-alive ping/pong → đóng → mở lại.
> WSS phải qua CONNECT tunnel + TLS trước khi WS upgrade (giống HTTPS goroutine).

**Connection alternation** — xen kẽ ws và wss:
```
Connection 1: ws://target:3001/ws-echo     (plain WebSocket)
Connection 2: wss://target:3443/ws-echo    (WebSocket qua CONNECT + TLS)
Connection 3: ws://target:3001/ws-echo     (plain)
Connection 4: wss://target:3443/ws-echo    (encrypted)
...lặp lại cho đến khi Stop
```

---

##### WS Connection (plain WebSocket — không TLS)

```
── Giai đoạn 1: TCP connect qua proxy ────────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ TCP connect tới proxy host:port                         │
  │ (Nếu proxy cần auth → Proxy-Authorization header)      │
  └─────────────────────────────────────────────────────────┘
  Runner đo: tcp_connect_ms

── Giai đoạn 2: WebSocket Upgrade ─────────────────────────
  Runner → Proxy → Target:
  ┌─────────────────────────────────────────────────────────┐
  │ GET /ws-echo?hold=60000 HTTP/1.1                        │
  │ Host: target:3001                                       │
  │ Upgrade: websocket                                      │
  │ Connection: Upgrade                                     │
  │ Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==           │
  │ Sec-WebSocket-Version: 13                               │
  │ User-Agent: ProxyTester/1.0                             │
  │ X-Run-Id: abc-123                                       │
  │ X-Connection-Num: 1                                     │
  └─────────────────────────────────────────────────────────┘

  Target trả về (qua Proxy):
  ┌─────────────────────────────────────────────────────────┐
  │ HTTP/1.1 101 Switching Protocols                        │
  │ Upgrade: websocket                                      │
  │ Connection: Upgrade                                     │
  │ Sec-WebSocket-Accept: HSmrc0sMlYUkAGmm5OPpG2HaGWk=    │
  └─────────────────────────────────────────────────────────┘

  Runner đo: handshake_ms = thời gian từ gửi Upgrade tới nhận 101
  Nếu KHÔNG nhận 101 → error_type = "ws_upgrade_failed"
  Proxy block WS? → status 403/502 → ghi error
```

---

##### WSS Connection (WebSocket qua CONNECT tunnel + TLS)

> WSS phức tạp hơn WS: phải qua 4 giai đoạn thay vì 2.

```
── Giai đoạn 1: TCP connect qua proxy ────────────────────
  (Giống WS)
  Runner đo: tcp_connect_ms

── Giai đoạn 2: CONNECT tunnel ────────────────────────────
  Runner → Proxy:
  ┌─────────────────────────────────────────────────────────┐
  │ CONNECT target:3443 HTTP/1.1                            │
  │ Host: target:3443                                       │
  │ Proxy-Authorization: Basic dXNlcjpwYXNz                │
  └─────────────────────────────────────────────────────────┘

  Proxy trả về:
  ┌─────────────────────────────────────────────────────────┐
  │ HTTP/1.1 200 Connection Established                     │
  └─────────────────────────────────────────────────────────┘

  Runner đo: connect_tunnel_ms
  Nếu fail → error_type: connect_tunnel_failed / proxy_auth_failed / proxy_rejected

── Giai đoạn 3: TLS handshake trong tunnel ────────────────
  Runner ←──TLS──→ Target (qua tunnel, Proxy chỉ forward bytes)

  Runner đo: tls_handshake_ms, tls_version, tls_cipher
  Nếu fail → error_type: tls_handshake_failed / tls_cert_expired / ...

── Giai đoạn 4: WebSocket Upgrade (trong tunnel encrypted) ─
  Runner → Target (encrypted):
  ┌─────────────────────────────────────────────────────────┐
  │ GET /ws-echo?hold=60000 HTTP/1.1                        │
  │ Host: target:3443                                       │
  │ Upgrade: websocket                                      │
  │ Connection: Upgrade                                     │
  │ Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==            │
  │ Sec-WebSocket-Version: 13                               │
  └─────────────────────────────────────────────────────────┘

  Target trả về (encrypted):
  ┌─────────────────────────────────────────────────────────┐
  │ HTTP/1.1 101 Switching Protocols                        │
  │ Upgrade: websocket                                      │
  │ Connection: Upgrade                                     │
  │ Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=    │
  └─────────────────────────────────────────────────────────┘

  Runner đo: handshake_ms (WS upgrade, TRONG tunnel)
```

**So sánh WS vs WSS timing**:
```
WS (plain):   tcp_connect → WS upgrade        = 2 giai đoạn
WSS (tunnel): tcp_connect → CONNECT → TLS → WS upgrade = 4 giai đoạn

WS total:   tcp_connect_ms + handshake_ms
WSS total:  tcp_connect_ms + connect_tunnel_ms + tls_handshake_ms + handshake_ms
```

---

##### Echo Messages — gửi/nhận liên tục trong connection

> Sau khi WS/WSS connection mở thành công, Runner gửi echo messages liên tục.
> Rate: `ws_messages_per_minute` (default 60 = 1 message/giây).

```
── Message format ─────────────────────────────────────────

  Runner → Target (gửi):
  ┌──────────────────────────────────────────────────────────┐
  │ {                                                        │
  │   "type": "echo",                                       │
  │   "seq": 1,                   ← số thứ tự message       │
  │   "connection_num": 1,        ← connection thứ mấy      │
  │   "ts": 1708770615123,        ← Unix timestamp (ms)     │
  │   "run_id": "abc-123",                                   │
  │   "payload": "x".repeat(64)   ← 64 bytes payload test   │
  │ }                                                        │
  └──────────────────────────────────────────────────────────┘

  Target → Runner (echo lại nguyên vẹn):
  ┌──────────────────────────────────────────────────────────┐
  │ {                                                        │
  │   "type": "echo",                                       │
  │   "seq": 1,                                              │
  │   "connection_num": 1,                                   │
  │   "ts": 1708770615123,        ← timestamp GỐC từ Runner │
  │   "run_id": "abc-123",                                   │
  │   "payload": "x".repeat(64)                              │
  │ }                                                        │
  └──────────────────────────────────────────────────────────┘

  Runner đo:
    rtt_ms = Date.now() - ts       ← RTT = thời gian khứ hồi
    message_size = sizeof(JSON)    ← bytes gửi/nhận

── Drop detection ─────────────────────────────────────────

  Runner theo dõi:
    messages_sent     = tổng messages đã gửi
    messages_received = tổng messages echo nhận lại
    drop_count        = sent - received    ← messages bị mất

  Nếu gửi seq=5 nhưng không nhận echo trong 5 giây:
    → Đánh dấu message dropped
    → drop_count++
    → Log WARN: "Message drop detected"

── Message rate control ───────────────────────────────────

  60 messages/phút = 1 message mỗi giây
  Dùng ticker:
    ticker := time.NewTicker(60s / ws_messages_per_minute)
    for range ticker.C {
        send echo message
        wait for echo response (timeout 5s)
    }
```

---

##### Ping/Pong Protocol — keep-alive

> Xen kẽ với echo messages, Runner gửi WebSocket ping frames để kiểm tra connection còn sống.

```
── Ping/Pong flow ─────────────────────────────────────────

  Mỗi 10 giây:
  ┌──────────────────────────────────────────────────────────┐
  │  Runner gửi: WebSocket Ping frame                       │
  │    payload: ping_seq (số thứ tự ping)                   │
  │                                                          │
  │  Target trả: WebSocket Pong frame                       │
  │    payload: echo ping_seq                                │
  │                                                          │
  │  Runner đo:                                              │
  │    pong_rtt_ms = thời gian từ ping tới pong             │
  │    pong_received = true/false                            │
  └──────────────────────────────────────────────────────────┘

  Nếu KHÔNG nhận Pong trong 5 giây:
    → Log WARN: "Pong timeout"
    → pong_timeout_count++
    → Không đóng connection ngay (chờ hết hold duration)

  Nếu 3 pong liên tiếp timeout:
    → Connection coi như dead
    → Đóng → ghi disconnect_reason = "pong_timeout"
    → Mở connection mới

── Ping schedule trong 60 giây hold ───────────────────────

  Giây 0:   WS/WSS connected
  Giây 1:   echo message #1
  Giây 2:   echo message #2
  ...
  Giây 10:  ping #1                    ← ping frame
  Giây 11:  echo message #11
  ...
  Giây 20:  ping #2                    ← ping frame
  ...
  Giây 30:  ping #3
  ...
  Giây 40:  ping #4
  ...
  Giây 50:  ping #5
  ...
  Giây 60:  connection hold hết → Runner chủ động đóng
            → disconnect_reason = "client_close"
            → Mở connection mới (ws hoặc wss, xen kẽ)

  Tổng trong 60 giây:
    echo messages: ~60 (1/giây)
    ping frames:   ~6 (mỗi 10 giây)
```

---

##### Connection Lifecycle & Reconnection Logic

> Mỗi connection giữ `ws_hold_duration_ms` (default 60s) rồi chủ động đóng, mở connection mới.

```
── Connection lifecycle ───────────────────────────────────

  ┌─────────────────────────────────────────────────────────────┐
  │ Connection #N                                                │
  │                                                              │
  │  1. Connect (WS hoặc WSS, xen kẽ)                          │
  │     → tcp_connect → [CONNECT tunnel] → [TLS] → WS upgrade  │
  │                                                              │
  │  2. Message loop (60 giây)                                   │
  │     → Gửi echo messages (1/giây)                            │
  │     → Gửi ping frames (mỗi 10 giây)                        │
  │     → Đếm drops, đo RTT                                     │
  │                                                              │
  │  3. Close                                                    │
  │     → Runner gửi Close frame (code 1000 = Normal Closure)   │
  │     → Hoặc: proxy/target đóng trước → ghi lý do            │
  │                                                              │
  │  4. Record ws_sample                                         │
  │     → Ghi tất cả metrics cho connection này                 │
  │                                                              │
  │  5. Reconnect → Connection #N+1                              │
  │     → Chuyển ws ↔ wss (xen kẽ)                             │
  └─────────────────────────────────────────────────────────────┘

── Disconnect reasons ─────────────────────────────────────

  | disconnect_reason   | Ai đóng    | Khi nào                              |
  |---------------------|------------|--------------------------------------|
  | client_close        | Runner     | Hold duration hết → Runner đóng      |
  | server_close        | Target     | Target chủ động đóng (Close frame)   |
  | proxy_close         | Proxy      | Proxy đóng tunnel/connection         |
  | pong_timeout        | Runner     | 3 pong liên tiếp timeout → coi dead  |
  | error               | Any        | Read/write error trên connection     |
  | timeout             | Runner     | Connect timeout hoặc handshake timeout|

── Reconnection logic ────────────────────────────────────

  Sau mỗi connection đóng:
    1. Ghi ws_sample cho connection vừa đóng
    2. Chờ 1 giây (backoff cố định)
    3. Chuyển protocol: ws → wss → ws → wss (xen kẽ)
    4. Mở connection mới

  Nếu connect fail:
    1. Retry tối đa 3 lần (backoff: 1s → 2s → 4s)
    2. Nếu vẫn fail → ghi ws_sample với error
    3. Chờ 10 giây → thử lại
    4. Không bỏ cuộc — goroutine chạy cho đến khi Stop

  Nếu Stop signal:
    1. Đóng connection hiện tại (nếu có)
    2. Ghi ws_sample cuối cùng
    3. Thoát goroutine
```

---

##### Runner đo (tổng hợp cho mỗi ws_sample)

```
Timing:
  • tcp_connect_ms       — TCP tới proxy (mọi connection)
  • tls_handshake_ms     — TLS trong tunnel (CHỈ wss, = 0 cho ws)
  • handshake_ms         — WS upgrade (101 Switching Protocols)

Message metrics:
  • message_rtt_ms       — trung bình RTT tất cả echo messages trong connection
  • messages_sent        — tổng echo messages gửi
  • messages_received    — tổng echo messages nhận lại
  • drop_count           — messages bị mất (sent - received)

Connection lifecycle:
  • started_at           — timestamp mở connection
  • connection_held_ms   — thời gian giữ connection (ms)
  • disconnect_reason    — client_close / server_close / proxy_close / pong_timeout / error / timeout

Identification:
  • target_url           — ws://target:3001/ws-echo hoặc wss://target:3443/ws-echo
  • seq                  — connection number (1, 2, 3, ...)
  • is_warmup            — false (WS không có warmup)
```

**So sánh WS vs WSS metrics**:
```
                    │ WS (plain)          │ WSS (encrypted)
────────────────────┼─────────────────────┼──────────────────────
tcp_connect_ms      │ ✓ có                │ ✓ có
tls_handshake_ms    │ ✗ = 0               │ ✓ có (> 0)
handshake_ms        │ ✓ WS upgrade        │ ✓ WS upgrade (trong tunnel)
target_url          │ ws://target:3001/   │ wss://target:3443/
Connect qua         │ TCP → WS upgrade    │ TCP → CONNECT → TLS → WS upgrade
Proxy thấy traffic? │ Có (plain text)     │ Không (encrypted)
```

#### Bảng tổng hợp: Target endpoints & mục đích

| Endpoint | Methods | Goroutine | Target trả gì | Mục đích đo |
|----------|---------|-----------|----------------|-------------|
| `http://target:3001/echo` | GET, POST, PUT, PATCH, DELETE, HEAD | HTTP | Echo method + body + headers | Test từng HTTP method qua proxy, TTFB, throughput |
| `http://target:3001/ip` | GET | HTTP | IP + headers JSON | Xác minh IP proxy, geo check, IP stability |
| `http://target:3001/large?size=N` | GET | HTTP | N bytes random data | Đo bandwidth qua plain HTTP |
| `http://target:3001/slow?delay=N` | GET | HTTP | Chờ N ms rồi trả OK | Đo timeout handling, jitter |
| `https://target:3443/echo` | GET, POST, PUT, PATCH, DELETE, HEAD | HTTPS | Echo method + body (encrypted) | Test từng method qua CONNECT tunnel + TLS |
| `https://target:3443/ip` | GET | HTTPS | IP + headers JSON | Xác minh IP qua HTTPS |
| `https://target:3443/large?size=N` | GET | HTTPS | N bytes random data | Đo bandwidth qua TLS |
| `ws://target:3001/ws-echo` | WS Upgrade | WS/WSS | Echo messages JSON | Đo handshake, RTT, drop, keep-alive |
| `wss://target:3443/ws-echo` | WSS Upgrade | WS/WSS | Echo messages (encrypted) | Đo TLS + WS qua CONNECT tunnel |
```

### 4.2 httptrace — Đo timing chính xác

```go
trace := &httptrace.ClientTrace{
    ConnectStart: func(network, addr string) {
        connectStart = time.Now()
    },
    ConnectDone: func(network, addr string, err error) {
        connectDone = time.Now()
    },
    TLSHandshakeStart: func() {
        tlsStart = time.Now()
    },
    TLSHandshakeDone: func(state tls.ConnectionState, err error) {
        tlsDone = time.Now()
        // Extract: state.Version, state.CipherSuite
    },
    GotFirstResponseByte: func() {
        gotFirstByte = time.Now()
    },
}

// tcp_connect_ms = connectDone - connectStart
// tls_handshake_ms = tlsDone - tlsStart (HTTPS only)
// ttfb_ms = gotFirstByte - requestStart
// total_ms = responseComplete - requestStart
```

### 4.3 Parallel Multi-Proxy Testing

```
┌──────────────────────────────────────────────────┐
│                  Scheduler                        │
│                                                    │
│  for each proxy in config.proxies:                │
│    go orchestrator.Run(ctx, proxy, targets)       │
│                                                    │
│  sync.WaitGroup + shared context timeout          │
│  Semaphore giới hạn max 10 parallel proxies       │
└──────┬──────────────┬──────────────┬─────────────┘
       │              │              │
 ┌─────▼────┐  ┌─────▼────┐  ┌─────▼────┐
 │ Proxy A  │  │ Proxy B  │  │ Proxy C  │
 │ (own     │  │ (own     │  │ (own     │
 │  rate    │  │  rate    │  │  rate    │
 │  limiter)│  │  limiter)│  │  limiter)│
 └─────┬────┘  └─────┬────┘  └─────┬────┘
       │              │              │
       └──────────────┼──────────────┘
                      │
              ResultCollector
              (batch → API/DB)
```

**Isolation**:
- Mỗi proxy có context riêng (child of parent) → 1 proxy fail không ảnh hưởng proxy khác
- Mỗi proxy có rate limiter riêng
- Mỗi proxy tạo test_run riêng → kết quả không bị trộn

### 4.4 Go Dependencies

```
github.com/jackc/pgx/v5          # PostgreSQL driver
gopkg.in/yaml.v3                  # YAML config
github.com/gorilla/websocket      # WebSocket client
golang.org/x/time/rate            # Token-bucket rate limiter
github.com/montanaflynn/stats     # Percentile calculation
github.com/google/uuid            # UUID generation
```

---

## 5. Target Service — Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/health` | GET | Health check → `{"status":"ok"}` |
| `/ip` | GET, HEAD | Trả IP client thấy → `{"ip":"1.2.3.4","headers":{...}}` |
| `/echo` | **GET, POST, PUT, PATCH, DELETE, HEAD** | Echo lại method + body + headers. Đây là endpoint chính để test từng HTTP method |
| `/large` | GET | Payload lớn → `?size=1048576` (bytes) |
| `/slow` | GET | Delay response → `?delay=2000` (ms) |
| `/ws-echo` | WS | Echo mỗi message, hỗ trợ ping/pong, `?hold=60000` |

**`/echo` response format** (cho mọi method):
```json
{
  "method": "POST",
  "body": {"test": true, "seq": 2},
  "headers": {
    "content-type": "application/json",
    "user-agent": "ProxyTester/1.0",
    "x-run-id": "abc-123",
    "x-seq": "2"
  },
  "content_length": 45,
  "timestamp": "2026-02-24T10:30:15.123Z"
}
```
- **GET**: body = null, content_length = 0
- **HEAD**: Chỉ trả headers (Content-Length vẫn có), không body
- **DELETE**: body = null
- **POST/PUT/PATCH**: echo nguyên body nhận được

> Target Service listen trên 2 ports:
> - `:3001` — HTTP (plain)
> - `:3443` — HTTPS (TLS, self-signed cert cho testing)

---

## 6. Controller API — REST Endpoints

### Pagination Convention

Tất cả list endpoints dùng **cursor-based pagination**:
- `?limit=20` (max 100)
- `?cursor=<opaque>`
- Response: `{ data: [...], pagination: { has_more, next_cursor, total_count } }`

### Endpoints

**Providers**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/providers` | List (paginated) |
| POST | `/api/v1/providers` | Create |
| GET | `/api/v1/providers/:id` | Get |
| PUT | `/api/v1/providers/:id` | Update |
| DELETE | `/api/v1/providers/:id` | Delete (cascade) |

**Proxies**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/proxies` | List (filter `?provider_id=`) |
| POST | `/api/v1/proxies` | Create |
| GET | `/api/v1/proxies/:id` | Get |
| PUT | `/api/v1/proxies/:id` | Update |
| DELETE | `/api/v1/proxies/:id` | Delete |

**Test Runs**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/runs` | List (filter `?proxy_id=`, `?status=`) |
| POST | `/api/v1/runs` | Create (status=pending) |
| GET | `/api/v1/runs/:id` | Get + summary |
| PATCH | `/api/v1/runs/:id/status` | Update status (Runner dùng) |
| POST | `/api/v1/runs/:id/stop` | **Stop test** — gửi signal dừng tới Runner |
| DELETE | `/api/v1/runs/:id` | Delete + cascade |

**Samples & Results**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/runs/:id/http-samples` | HTTP samples (paginated, `?is_warmup=false`) |
| GET | `/api/v1/runs/:id/ws-samples` | WS samples (paginated) |
| GET | `/api/v1/runs/:id/ip-checks` | IP check results |
| GET | `/api/v1/runs/:id/summary` | Run summary |
| GET | `/api/v1/runs/:id/export` | Full JSON export |

**Runner Ingestion**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/runs/:id/http-samples/batch` | Batch insert (max 100/call) |
| POST | `/api/v1/runs/:id/ws-samples/batch` | Batch insert |
| POST | `/api/v1/runs/:id/ip-checks` | Submit IP check |
| POST | `/api/v1/runs/:id/summary` | Submit summary |

**Comparison**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/providers/compare` | So sánh providers (`?provider_ids=a,b`) |

---

## 7. Config YAML — Advanced / CLI mode (optional)

> **Lưu ý**: Flow chính là nhập qua Dashboard UI. YAML chỉ dành cho advanced users muốn chạy CLI trực tiếp.
> Khi dùng UI, hệ thống tự generate config từ DB — anh không cần sửa file YAML.

```yaml
version: "1"

defaults:
  run_mode: "continuous"               # continuous = chạy đến khi Stop, fixed = chạy N requests
  request_timeout_ms: 10000
  ws_connect_timeout_ms: 5000
  ws_hold_duration_ms: 60000
  http_rpm: 500                        # plain HTTP goroutine (500 RPM)
  https_rpm: 500                       # HTTPS goroutine (500 RPM)
  # Tổng: 1000 RPM per proxy (500 HTTP + 500 HTTPS)
  ws_messages_per_minute: 60
  warmup_requests: 10
  concurrency_count: 100
  concurrency_burst_interval_sec: 300  # burst test mỗi 5 phút
  summary_interval_sec: 30             # tính summary mỗi 30 giây
  max_parallel_proxies: 10

reporter:
  mode: "api"                          # "api" hoặc "db"
  api_url: "http://localhost:8000/api/v1"
  db_url: "${DATABASE_URL}"            # dùng khi mode=db
  batch_size: 50

targets:
  http:
    - url: "http://target:3001/ip"
      label: "self-hosted-ip"
    - url: "http://target:3001/echo"
      label: "self-hosted-echo"
      method: "POST"
      body: '{"test": true}'
  https:
    - url: "https://target:3443/ip"
      label: "self-hosted-https-ip"
  ws:
    - url: "ws://target:3001/ws-echo"
      label: "self-hosted-ws"
  wss:
    - url: "wss://target:3443/ws-echo"
      label: "self-hosted-wss"

ip_check:
  enabled: true
  dnsbl_servers:
    - "zen.spamhaus.org"
    - "b.barracudacentral.org"
    - "bl.spamcop.net"
    - "dnsbl.sorbs.net"
  geo_api: "http://ip-api.com/json/{ip}?fields=status,country,countryCode,region,city"
  stability_check_interval: 30         # giây

# Password lấy từ env var, KHÔNG lưu trong YAML
# 10 proxies từ 10 nhà cung cấp — test song song cùng lúc
proxies:
  - label: "BrightData-VN-Static-1"
    provider: "BrightData"
    host: "brd.superproxy.io"
    port: 22225
    protocol: "http"
    auth_user: "brd-customer-xxx"
    auth_pass_env: "BRIGHTDATA_PASS"
    expected_country: "VN"
    is_dedicated: true

  - label: "Oxylabs-VN-Static-1"
    provider: "Oxylabs"
    host: "pr.oxylabs.io"
    port: 7777
    protocol: "http"
    auth_user: "customer-xxx"
    auth_pass_env: "OXYLABS_PASS"
    expected_country: "VN"
    is_dedicated: false

  - label: "SmartProxy-VN-Static-1"
    provider: "SmartProxy"
    host: "gate.smartproxy.com"
    port: 7000
    protocol: "http"
    auth_user: "user-spxxx"
    auth_pass_env: "SMARTPROXY_PASS"
    expected_country: "VN"
    is_dedicated: true

  - label: "IPRoyal-VN-Static-1"
    provider: "IPRoyal"
    host: "geo.iproyal.com"
    port: 12321
    protocol: "http"
    auth_user: "iproyal-user"
    auth_pass_env: "IPROYAL_PASS"
    expected_country: "VN"
    is_dedicated: true

  - label: "GeoNode-VN-Static-1"
    provider: "GeoNode"
    host: "premium-residential.geonode.com"
    port: 9000
    protocol: "http"
    auth_user: "geonode-user"
    auth_pass_env: "GEONODE_PASS"
    expected_country: "VN"
    is_dedicated: false

  - label: "Webshare-VN-Static-1"
    provider: "Webshare"
    host: "proxy.webshare.io"
    port: 80
    protocol: "http"
    auth_user: "webshare-user"
    auth_pass_env: "WEBSHARE_PASS"
    expected_country: "VN"
    is_dedicated: false

  - label: "SOAX-VN-Static-1"
    provider: "SOAX"
    host: "proxy.soax.com"
    port: 9000
    protocol: "http"
    auth_user: "soax-user"
    auth_pass_env: "SOAX_PASS"
    expected_country: "VN"
    is_dedicated: true

  - label: "StormProxies-VN-Static-1"
    provider: "StormProxies"
    host: "proxy.stormproxies.com"
    port: 8080
    protocol: "http"
    auth_user: "storm-user"
    auth_pass_env: "STORMPROXIES_PASS"
    expected_country: "VN"
    is_dedicated: false

  - label: "ProxySeller-VN-Static-1"
    provider: "Proxy-Seller"
    host: "proxy.proxy-seller.com"
    port: 10000
    protocol: "http"
    auth_user: "seller-user"
    auth_pass_env: "PROXY_SELLER_PASS"
    expected_country: "VN"
    is_dedicated: true

  - label: "Infatica-VN-Static-1"
    provider: "Infatica"
    host: "proxy.infatica.io"
    port: 8000
    protocol: "http"
    auth_user: "infatica-user"
    auth_pass_env: "INFATICA_PASS"
    expected_country: "VN"
    is_dedicated: false
```

---

## 8. Scoring Model

### 8.1 Component Scores (0.0 → 1.0)

**S_uptime** (Weight: 0.25):
```
S_uptime = http_success_count / http_sample_count
```

**S_latency** (Weight: 0.25):
```
S_latency = clamp(1 - (ttfb_p95_ms / 500), 0, 1)
```
Budget 500ms configurable. Nếu p95 < 100ms → score > 0.8.

**S_jitter** (Weight: 0.15):
```
S_jitter = clamp(1 - (jitter_ms / 100), 0, 1)
```

**S_ws** (Weight: 0.15):
```
S_ws = 0.4*(1 - ws_error_rate) + 0.3*(1 - ws_drop_rate) + 0.3*(ws_avg_hold_ms / ws_hold_duration_ms)
```

**S_security** (Weight: 0.20):
```
S_security = 0.30*ip_clean + 0.25*geo_match + 0.25*ip_stable + 0.20*tls_score
```
- `tls_score`: 1.0 nếu TLS 1.2+, 0.5 nếu TLS 1.1, 0.0 nếu thấp hơn

### 8.2 Composite Score
```
score_total = 0.25*S_uptime + 0.25*S_latency + 0.15*S_jitter + 0.15*S_ws + 0.20*S_security
```

**Nếu skip phase** (VD: không test WS): redistribute weight tỷ lệ cho các component còn lại.

### 8.3 Grade

| Range | Grade | Ý nghĩa |
|-------|-------|---------|
| 0.90+ | A | Production ready |
| 0.75-0.89 | B | Tốt, ít vấn đề |
| 0.60-0.74 | C | Trung bình |
| 0.40-0.59 | D | Kém |
| <0.40 | F | Không dùng được |

---

## 9. Logging & Observability Spec

### 9.1 Log Levels

| Level | Khi nào dùng | Ví dụ |
|-------|-------------|-------|
| **FATAL** | Service không thể tiếp tục, phải tắt | DB connection fail khi startup, config file invalid |
| **ERROR** | Lỗi cần xử lý, nhưng service vẫn chạy | Request fail, proxy auth rejected, WS drop unexpected |
| **WARN** | Bất thường nhưng chưa phải lỗi | Latency spike > 2x average, retry attempt, IP changed |
| **INFO** | Sự kiện quan trọng trong flow bình thường | Phase started/completed, run created, batch reported |
| **DEBUG** | Chi tiết kỹ thuật cho developer debug | Raw timing values, HTTP headers, TLS cipher details |

### 9.2 Log Format (Structured JSON)

Tất cả services đều dùng **structured JSON logs** — mỗi dòng log là 1 JSON object.

```json
{
  "timestamp": "2026-02-24T10:30:15.123Z",
  "level": "ERROR",
  "service": "runner",
  "module": "proxy.http_tester",
  "run_id": "abc-123",
  "proxy_id": "def-456",
  "proxy_label": "BrightData-VN-1",
  "goroutine": "https",
  "phase": "continuous",
  "message": "HTTPS request failed",
  "method": "POST",
  "error_type": "timeout",
  "error_detail": "context deadline exceeded after 10000ms",
  "target_url": "https://target:3443/echo",
  "seq": 42,
  "duration_ms": 10001,
  "running_for_ms": 185000,
  "stack_trace": "proxy/http_tester.go:128 → engine/orchestrator.go:95"
}
```

**Bắt buộc trong mọi log entry**:
- `timestamp` — ISO 8601
- `level` — FATAL/ERROR/WARN/INFO/DEBUG
- `service` — runner | api | target | dashboard
- `module` — tên module cụ thể (xem 9.3)
- `message` — mô tả ngắn gọn

**Bắt buộc khi có context**:
- `run_id` — luôn attach khi đang trong test run
- `proxy_id` + `proxy_label` — luôn attach khi liên quan tới proxy
- `error_type` + `error_detail` — bắt buộc với ERROR level
- `goroutine` — goroutine nào: `http`, `https`, `ws`, `summary`, `scheduler`, `burst`
- `phase` — phase nào: `startup`, `connectivity`, `ip_check`, `warmup`, `continuous`, `stopping`, `final_summary`
- `request_type` — loại request: `echo`, `bandwidth`, `timeout_test`, `ip_check` (dùng trong http/https tester)

> **Quy tắc quan trọng**: Mọi log entry trong Go Runner ở giai đoạn test đều **PHẢI** có `phase` field. Không được bỏ sót — khi filter log theo phase sẽ thấy đầy đủ mọi event xảy ra trong phase đó.

### 9.3 Logging theo từng Module

#### Go Runner — Modules & Log Points

**`server.handler` module** (Runner HTTP server — nhận trigger từ API):
| Event | Level | Log gì |
|-------|-------|--------|
| Runner process starting | INFO | `port`, `api_url`, `log_level`, `go_version`, `phase: "startup"` |
| Runner config loaded | INFO | `api_url`, `runner_port`, `max_parallel`, `phase: "startup"` |
| Runner server started | INFO | `port`, `api_url`, `phase: "startup"` |
| Trigger received | INFO | `run_id`, `proxy_count`, `source` (API/CLI) |
| Stop signal received | INFO | `run_id`, `proxy_label` |
| Runner server shutdown | INFO | `uptime_ms`, `total_runs_completed` |
| Invalid trigger request | WARN | `error_detail`, `request_body` (masked) |
| Runner busy (already running) | WARN | `current_run_ids`, `rejected_run_id` |

**`config` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Config loaded from DB | INFO | `proxy_count`, `target_count`, `run_mode` |
| Config loaded from YAML | INFO | `config_path`, số proxies, số targets |
| Config validation fail | FATAL | Field nào sai, giá trị nhận được vs expected |
| Password decrypted | DEBUG | `proxy_label` (KHÔNG log password value) |
| Password decrypt fail | ERROR | `proxy_label`, `error_detail` |

**`proxy.dialer` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| TCP connect start | DEBUG | `proxy_host`, `proxy_port` |
| TCP connect success | INFO | `proxy_label`, `connect_ms` |
| TCP connect fail | ERROR | `proxy_label`, `error_detail`, `connect_ms` elapsed |
| Auth success | INFO | `proxy_label`, `auth_mode` |
| Auth fail (407) | ERROR | `proxy_label`, `status_code`, `auth_mode` |

**`proxy.http_tester` module** (goroutine: `http`) — plain HTTP requests, test từng method:
| Event | Level | Log gì |
|-------|-------|--------|
| HTTP transport created | INFO | `proxy_url` (masked password), `timeout_ms`, `goroutine: "http"`, `phase: "continuous"` |
| HTTP goroutine started | INFO | `proxy_label`, `run_id`, `http_rpm`, `goroutine: "http"`, `phase: "continuous"` |
| HTTP request start | DEBUG | `seq`, `target_url`, `method` (GET/POST/PUT/PATCH/DELETE/HEAD), `request_type` (echo/bandwidth/timeout_test/ip_check), `is_https: false`, `phase: "continuous"` |
| HTTP request success | DEBUG | `seq`, `method`, `request_type`, `status_code`, `tcp_connect_ms`, `ttfb_ms`, `total_ms`, `bytes_sent`, `bytes_received`, `phase: "continuous"` |
| HTTP request fail | ERROR | `seq`, `method`, `request_type`, `target_url`, `error_type`, `error_detail`, `duration_ms`, `phase: "continuous"` |
| HTTP latency spike | WARN | `seq`, `method`, `total_ms`, `average_ms`, `spike_ratio` (khi > 2x avg), `phase: "continuous"` |
| HTTP non-200 status | WARN | `seq`, `method`, `status_code`, `target_url`, `phase: "continuous"` |
| IP stability check | INFO | `observed_ip`, `ip_changed` (boolean), `check_count`, `request_type: "ip_check"`, `phase: "continuous"` |
| Method batch complete | DEBUG | `batch_num`, `methods_tested: ["GET","POST","PUT","PATCH","DELETE","HEAD"]`, `avg_ms_per_method`, `phase: "continuous"` |
| Cancel signal received | INFO | `goroutine: "http"`, `proxy_label`, `seq` (last seq), `phase: "stopping"` |
| Draining in-flight request | DEBUG | `goroutine: "http"`, `seq`, `elapsed_ms`, `phase: "stopping"` |
| HTTP goroutine stopped | INFO | `proxy_label`, `total_requests`, `per_method_count: {GET:N, POST:N, ...}`, `running_for_ms`, `phase: "stopping"` |

**`proxy.https_tester` module** (goroutine: `https`) — HTTPS qua CONNECT tunnel, test từng method:

> HTTPS goroutine chạy **RIÊNG BIỆT** với HTTP goroutine.
> HTTPS đi qua 3 giai đoạn riêng biệt, lỗi có thể xảy ra ở bất kỳ đâu.
> Mỗi giai đoạn phải log riêng để khi debug biết chính xác gãy ở chỗ nào.

```
Giai đoạn 1: CONNECT tunnel     (Runner → Proxy)
Giai đoạn 2: TLS handshake      (Runner ←→ Target, qua tunnel)
Giai đoạn 3: HTTPS request      (Runner → Target, encrypted)
```

| Event | Level | Log gì |
|-------|-------|--------|
| HTTPS transport created | INFO | `proxy_url` (masked password), `timeout_ms`, `goroutine: "https"`, `phase: "continuous"` |
| HTTPS goroutine started | INFO | `proxy_label`, `run_id`, `https_rpm`, `goroutine: "https"`, `phase: "continuous"` |
| HTTPS request start | DEBUG | `seq`, `target_url`, `method` (GET/POST/PUT/PATCH/DELETE/HEAD), `request_type` (echo/bandwidth), `is_https: true`, `phase: "continuous"` |
| **--- Giai đoạn 1: CONNECT tunnel ---** | | |
| CONNECT tunnel start | DEBUG | `seq`, `proxy_host`, `target_host`, `target_port: 3443`, `has_auth` (boolean), `phase: "continuous"` |
| CONNECT tunnel success | DEBUG | `seq`, `connect_tunnel_ms`, `proxy_status: 200`, `phase: "continuous"` |
| CONNECT tunnel fail | ERROR | `seq`, `proxy_status` (502/503), `error_detail`, `connect_tunnel_ms`, `phase: "continuous"` |
| CONNECT tunnel timeout | ERROR | `seq`, `target_host`, `timeout_ms`, `elapsed_ms`, `phase: "continuous"` |
| CONNECT proxy auth fail | ERROR | `seq`, `proxy_status: 407`, `proxy_label`, `auth_mode`, `phase: "continuous"` |
| CONNECT proxy rejected | ERROR | `seq`, `proxy_status: 403`, `target_host` (proxy block target), `phase: "continuous"` |
| **--- Giai đoạn 2: TLS handshake ---** | | |
| TLS handshake start | DEBUG | `seq`, `target_host`, `phase: "continuous"` |
| TLS handshake success | DEBUG | `seq`, `tls_handshake_ms`, `tls_version`, `tls_cipher`, `phase: "continuous"` |
| TLS handshake fail | ERROR | `seq`, `target_host`, `error_detail`, `tls_handshake_ms`, `phase: "continuous"` |
| TLS certificate error | ERROR | `seq`, `target_host`, `cert_error` (expired/untrusted/hostname mismatch), `phase: "continuous"` |
| TLS version weak | WARN | `seq`, `tls_version` (< TLS 1.2), `target_host`, `phase: "continuous"` |
| TLS cipher weak | WARN | `seq`, `tls_cipher`, `cipher_strength`, `target_host`, `phase: "continuous"` |
| **--- Giai đoạn 3: HTTPS request ---** | | |
| HTTPS request sent | DEBUG | `seq`, `method` (GET/POST/...), `request_type`, `target_url` (trong tunnel encrypted), `phase: "continuous"` |
| HTTPS response received | DEBUG | `seq`, `method`, `request_type`, `status_code`, `ttfb_ms`, `total_ms`, `bytes_sent`, `bytes_received`, `phase: "continuous"` |
| HTTPS request fail | ERROR | `seq`, `method`, `request_type`, `target_url`, `error_type`, `error_detail`, `duration_ms`, `phase: "continuous"` |
| HTTPS latency spike | WARN | `seq`, `method`, `total_ms`, `average_ms`, `spike_ratio`, `phase: "continuous"` |
| HTTPS non-200 status | WARN | `seq`, `method`, `status_code`, `target_url`, `phase: "continuous"` |
| HTTPS method batch complete | DEBUG | `batch_num`, `methods_tested`, `avg_ms_per_method`, `phase: "continuous"` |
| **--- Timing breakdown ---** | | |
| HTTPS total timing | DEBUG | `seq`, `method`, `connect_tunnel_ms`, `tls_handshake_ms`, `ttfb_ms`, `total_ms`, `phase: "continuous"` |
| **--- Goroutine stop ---** | | |
| Cancel signal received | INFO | `goroutine: "https"`, `proxy_label`, `seq` (last seq), `phase: "stopping"` |
| Draining in-flight request | DEBUG | `goroutine: "https"`, `seq`, `elapsed_ms`, `phase: "stopping"` |
| HTTPS goroutine stopped | INFO | `proxy_label`, `total_requests`, `per_method_count: {GET:N,...}`, `running_for_ms`, `phase: "stopping"` |

**Ví dụ log HTTPS thành công** (1 request = 5 log entries):
```json
{"level":"DEBUG","module":"proxy.https_tester","goroutine":"https","seq":42,"method":"POST","request_type":"echo","message":"HTTPS request start","target_url":"https://target:3443/echo","phase":"continuous"}
{"level":"DEBUG","module":"proxy.https_tester","goroutine":"https","seq":42,"message":"CONNECT tunnel success","connect_tunnel_ms":35,"proxy_status":200,"phase":"continuous"}
{"level":"DEBUG","module":"proxy.https_tester","goroutine":"https","seq":42,"message":"TLS handshake success","tls_handshake_ms":78,"tls_version":"TLS 1.3","tls_cipher":"TLS_AES_128_GCM_SHA256","phase":"continuous"}
{"level":"DEBUG","module":"proxy.https_tester","goroutine":"https","seq":42,"method":"POST","request_type":"echo","message":"HTTPS response received","status_code":200,"ttfb_ms":145,"total_ms":210,"phase":"continuous"}
{"level":"DEBUG","module":"proxy.https_tester","goroutine":"https","seq":42,"method":"POST","message":"HTTPS total timing","connect_tunnel_ms":35,"tls_handshake_ms":78,"ttfb_ms":145,"total_ms":210,"phase":"continuous"}
```

**Ví dụ log HTTPS lỗi ở TLS** (biết ngay gãy ở giai đoạn 2):
```json
{"level":"DEBUG","module":"proxy.https_tester","goroutine":"https","seq":43,"message":"CONNECT tunnel success","connect_tunnel_ms":40,"phase":"continuous"}
{"level":"ERROR","module":"proxy.https_tester","goroutine":"https","seq":43,"message":"TLS handshake fail","tls_handshake_ms":120,"error_type":"tls_cert_untrusted","error_detail":"x509: certificate signed by unknown authority","phase":"continuous"}
```

**Ví dụ log HTTPS lỗi ở CONNECT tunnel** (gãy ngay giai đoạn 1, không có TLS/HTTPS log):
```json
{"level":"ERROR","module":"proxy.https_tester","goroutine":"https","seq":44,"message":"CONNECT tunnel fail","proxy_status":502,"error_type":"proxy_error","error_detail":"Bad Gateway","connect_tunnel_ms":5001,"phase":"continuous"}
```

**Ví dụ log warmup** (phase riêng, dễ filter):
```json
{"level":"INFO","module":"engine.orchestrator","message":"Warmup start","proxy_label":"BrightData-VN-1","warmup_count":5,"phase":"warmup"}
{"level":"DEBUG","module":"engine.orchestrator","seq":1,"method":"GET","message":"Warmup request success","total_ms":85,"status_code":200,"phase":"warmup"}
{"level":"WARN","module":"engine.orchestrator","seq":2,"method":"GET","message":"Warmup request fail","error_type":"timeout","total_ms":10001,"phase":"warmup"}
{"level":"INFO","module":"engine.orchestrator","message":"Warmup complete","warmup_count":5,"success_count":4,"fail_count":1,"avg_ms":95,"phase":"warmup"}
```

**Ví dụ log graceful stop** (từng bước rõ ràng):
```json
{"level":"INFO","module":"engine.orchestrator","message":"Stop signal received","run_id":"abc-123","total_samples_so_far":2980,"running_for_ms":185000,"phase":"stopping"}
{"level":"INFO","module":"engine.orchestrator","message":"Draining in-flight requests","pending_goroutines":["http","https","ws"],"drain_timeout_ms":10000,"phase":"stopping"}
{"level":"INFO","module":"proxy.http_tester","goroutine":"http","message":"Cancel signal received","seq":1500,"phase":"stopping"}
{"level":"DEBUG","module":"proxy.http_tester","goroutine":"http","message":"Draining in-flight request","seq":1500,"elapsed_ms":85,"phase":"stopping"}
{"level":"INFO","module":"proxy.http_tester","goroutine":"http","message":"HTTP goroutine stopped","total_requests":1500,"running_for_ms":185000,"phase":"stopping"}
{"level":"INFO","module":"proxy.https_tester","goroutine":"https","message":"Cancel signal received","seq":1480,"phase":"stopping"}
{"level":"INFO","module":"proxy.https_tester","goroutine":"https","message":"HTTPS goroutine stopped","total_requests":1480,"running_for_ms":185000,"phase":"stopping"}
{"level":"INFO","module":"proxy.ws_tester","goroutine":"ws","message":"Cancel signal received","connection_num":45,"phase":"stopping"}
{"level":"INFO","module":"engine.orchestrator","message":"All goroutines stopped","total_goroutine_stop_ms":2500,"phase":"stopping"}
{"level":"INFO","module":"engine.orchestrator","message":"Final summary","run_id":"abc-123","final_score":0.85,"total_http_samples":1500,"total_https_samples":1480,"phase":"final_summary"}
{"level":"INFO","module":"engine.orchestrator","message":"Orchestrator complete","run_id":"abc-123","final_status":"completed","phase":"final_summary"}
```

**`proxy.ws_tester` module** (goroutine: `ws`) — bao gồm ws + wss, xen kẽ:
| Event | Level | Log gì |
|-------|-------|--------|
| WS goroutine started | INFO | `proxy_label`, `run_id`, `mpm`, `hold_duration_ms`, `goroutine: "ws"` |
| **--- Connection alternation (ws ↔ wss) ---** | | |
| Connection start | INFO | `connection_num`, `protocol` (ws/wss), `target_url` |
| **--- Nếu wss: CONNECT tunnel + TLS trước ---** | | |
| WSS CONNECT tunnel start | DEBUG | `target_url`, `is_wss: true`, `connection_num` |
| WSS CONNECT tunnel success | DEBUG | `connect_tunnel_ms`, `connection_num` |
| WSS CONNECT tunnel fail | ERROR | `proxy_status`, `error_detail`, `connection_num` |
| WSS TLS handshake success | DEBUG | `tls_handshake_ms`, `tls_version`, `tls_cipher`, `connection_num` |
| WSS TLS handshake fail | ERROR | `error_detail`, `tls_handshake_ms`, `connection_num` |
| **--- WebSocket upgrade ---** | | |
| WS upgrade start | DEBUG | `target_url`, `is_wss`, `connection_num` |
| WS upgrade success (101) | INFO | `target_url`, `handshake_ms`, `connection_num` |
| WS upgrade fail | ERROR | `target_url`, `status_code` (not 101), `error_detail`, `connection_num` |
| **--- Message loop ---** | | |
| Message sent | DEBUG | `seq`, `message_size`, `connection_num` |
| Message RTT recorded | DEBUG | `seq`, `rtt_ms`, `connection_num` |
| Message drop detected | WARN | `seq`, `messages_sent`, `messages_received`, `drop_count`, `connection_num` |
| **--- Ping/Pong keep-alive ---** | | |
| Ping sent | DEBUG | `connection_num`, `ping_seq` |
| Pong received | DEBUG | `connection_num`, `ping_seq`, `pong_rtt_ms` |
| Pong timeout | WARN | `connection_num`, `ping_seq`, `timeout_ms`, `consecutive_timeouts` |
| Pong 3x timeout → dead | ERROR | `connection_num`, `consecutive_timeouts: 3`, force close |
| **--- Connection lifecycle ---** | | |
| Connection held | INFO | `connection_held_ms`, `disconnect_reason`, `connection_num`, `protocol` (ws/wss) |
| Unexpected disconnect | ERROR | `connection_held_ms`, `disconnect_reason`, `error_detail`, `connection_num` |
| Per-connection summary | INFO | `connection_num`, `protocol`, `handshake_ms`, `messages_sent`, `messages_received`, `drop_count`, `avg_rtt_ms`, `connection_held_ms`, `disconnect_reason` |
| **--- Reconnection ---** | | |
| WS reconnecting | INFO | `connection_num` (next), `previous_disconnect_reason`, `next_protocol` (ws/wss), `backoff_ms` |
| WS connect retry | WARN | `connection_num`, `retry_attempt` (1-3), `backoff_ms`, `error_detail` |
| WS connect retry exhausted | ERROR | `connection_num`, `total_attempts: 3`, `wait_before_next: 10s` |
| **--- Goroutine stop ---** | | |
| Cancel signal received | INFO | `goroutine: "ws"`, `proxy_label`, `connection_num` (current), `phase: "stopping"` |
| Closing active connection | DEBUG | `goroutine: "ws"`, `connection_num`, `protocol` (ws/wss), `connection_held_ms`, `phase: "stopping"` |
| WS goroutine stopped | INFO | `proxy_label`, `total_connections`, `ws_connections`, `wss_connections`, `total_messages_sent`, `total_messages_received`, `total_drops`, `running_for_ms`, `phase: "stopping"` |

**`ipcheck.blacklist` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Blacklist check start | INFO | `observed_ip`, `dnsbl_count` |
| IP clean | INFO | `observed_ip`, `blacklists_queried` |
| IP listed (dirty) | WARN | `observed_ip`, `blacklist_source`, `blacklists_listed` |
| DNSBL query fail | WARN | `dnsbl_server`, `error_detail` (server down, không phải IP bẩn) |

**`ipcheck.geoip` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Geo lookup done | INFO | `observed_ip`, `actual_country`, `actual_city` |
| Geo mismatch | WARN | `expected_country`, `actual_country`, `observed_ip` |
| Geo API fail | ERROR | `api_url`, `error_detail` |

**`engine.orchestrator` module** (quản lý 4 goroutines song song per proxy):
| Event | Level | Log gì |
|-------|-------|--------|
| Orchestrator start | INFO | `proxy_label`, `run_id`, `run_mode: "continuous"`, `phase: "startup"` |
| **--- Phase 0: Connectivity ---** | | |
| Connectivity check start | INFO | `proxy_label`, `proxy_host`, `proxy_port`, `phase: "connectivity"` |
| Connectivity check pass | INFO | `proxy_label`, `connect_ms`, `phase: "connectivity"` |
| Connectivity check fail | ERROR | `proxy_label`, `error_type`, `error_detail`, `connect_ms`, `phase: "connectivity"` → dừng proxy này |
| **--- Phase 1: IP Check ---** | | |
| IP check start | INFO | `proxy_label`, `target_url`, `phase: "ip_check"` |
| IP check complete | INFO | `proxy_label`, `observed_ip`, `geo_match`, `is_clean`, `phase: "ip_check"` |
| IP check fail | ERROR | `proxy_label`, `error_detail`, `phase: "ip_check"` (không dừng, chỉ ghi lỗi) |
| **--- Phase 2: Warmup ---** | | |
| Warmup start | INFO | `proxy_label`, `warmup_count`, `phase: "warmup"` |
| Warmup request success | DEBUG | `seq`, `method`, `total_ms`, `status_code`, `phase: "warmup"` |
| Warmup request fail | WARN | `seq`, `method`, `error_type`, `error_detail`, `total_ms`, `phase: "warmup"` |
| Warmup complete | INFO | `warmup_count`, `success_count`, `fail_count`, `avg_ms`, `phase: "warmup"` |
| **--- Phase 3: Continuous ---** | | |
| Continuous phase start | INFO | `proxy_label`, `goroutines: ["http","https","ws","summary"]`, `phase: "continuous"` |
| All 4 goroutines running | INFO | `proxy_label`, `http_rpm`, `https_rpm`, `ws_mpm`, `phase: "continuous"` |
| Concurrency burst start | INFO | `run_id`, `concurrent_count`, `goroutine: "burst"`, `phase: "continuous"` |
| Concurrency burst complete | INFO | `run_id`, `concurrent_count`, `success_count`, `fail_count`, `avg_ms`, `goroutine: "burst"`, `phase: "continuous"` |
| Rolling summary | INFO | `run_id`, `total_http`, `total_https`, `total_ws`, `uptime_ratio`, `score_total`, `running_for_ms`, `goroutine: "summary"`, `phase: "continuous"` |
| Rate limiter wait | DEBUG | `wait_ms`, `goroutine` (http/https/ws), `phase: "continuous"` |
| Sample channel near capacity | WARN | `channel_size`, `channel_capacity`, `usage_percent`, `goroutine`, `phase: "continuous"` |
| Sample channel full | ERROR | `channel_capacity`, `goroutine` (bị block), `blocked_for_ms`, `phase: "continuous"` |
| **--- Phase: Stopping ---** | | |
| Stop signal received | INFO | `run_id`, `total_samples_so_far`, `running_for_ms`, `phase: "stopping"` |
| Draining in-flight requests | INFO | `run_id`, `pending_goroutines: ["http","https","ws"]`, `drain_timeout_ms: 10000`, `phase: "stopping"` |
| Goroutine stopped | INFO | `goroutine` (http/https/ws/summary), `proxy_label`, `samples_from_this_goroutine`, `phase: "stopping"` |
| Drain timeout forced stop | WARN | `run_id`, `timed_out_goroutines: [...]`, `drain_timeout_ms: 10000`, `phase: "stopping"` |
| All goroutines stopped | INFO | `proxy_label`, `total_goroutine_stop_ms`, `phase: "stopping"` |
| **--- Phase: Final Summary ---** | | |
| Final summary | INFO | `run_id`, `total_duration_ms`, `total_http_samples`, `total_https_samples`, `total_ws_samples`, `final_score`, `phase: "final_summary"` |
| Orchestrator complete | INFO | `run_id`, `proxy_label`, `final_status` (completed/failed), `phase: "final_summary"` |
| Orchestrator error | ERROR | `proxy_label`, `error_detail`, `goroutine` (http/https/ws/summary), `phase` |

**`engine.scheduler` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Scheduler start | INFO | `proxy_count`, `max_parallel` |
| Proxy goroutine start | INFO | `proxy_label`, `goroutine_id` |
| Proxy goroutine done | INFO | `proxy_label`, `status` (success/failed), `duration_ms` |
| Proxy goroutine panic recovered | ERROR | `proxy_label`, `panic_message`, `stack_trace` |
| All proxies done | INFO | `total_duration_ms`, `success_count`, `fail_count` |

**`engine.result_collector` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Batch assembled | DEBUG | `run_id`, `batch_size`, `http_count`, `https_count`, `queue_depth` |
| Summary computed | INFO | `run_id`, `uptime_ratio`, `ttfb_p95`, `score_total`, `http_sample_count`, `https_sample_count` |
| Summary diff | DEBUG | `run_id`, `prev_score`, `new_score`, `score_delta`, `new_samples_since_last` |
| Percentile calc | DEBUG | `metric_name`, `p50`, `p95`, `p99`, `sample_count` |
| Percentile calc per protocol | DEBUG | `metric_name`, `protocol` (http/https), `p50`, `p95`, `p99`, `sample_count` |
| No samples for metric | WARN | `run_id`, `metric_name` |

**`reporter.api_reporter` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Batch POST start | DEBUG | `endpoint`, `batch_size` |
| Batch POST success | INFO | `endpoint`, `batch_size`, `response_ms` |
| Batch POST fail | ERROR | `endpoint`, `status_code`, `error_detail`, `retry_attempt` |
| Retry scheduled | WARN | `endpoint`, `retry_in_ms`, `attempt` |
| All retries exhausted | ERROR | `endpoint`, `total_attempts`, `samples_lost` |

**`reporter.db_reporter` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| DB insert start | DEBUG | `table`, `row_count` |
| DB insert success | INFO | `table`, `row_count`, `duration_ms` |
| DB insert fail | ERROR | `table`, `error_detail`, `row_count` |
| DB connection fail | FATAL | `db_url` (masked), `error_detail` |

**`scoring.scorer` module**:
| Event | Level | Log gì |
|-------|-------|--------|
| Score computed | INFO | `run_id`, `score_total`, `grade` |
| Component scores | DEBUG | `s_uptime`, `s_latency`, `s_jitter`, `s_ws`, `s_security` |
| Phase skipped in scoring | WARN | `skipped_phase`, `weight_redistributed` |
| All metrics null | ERROR | `run_id` — không tính được score |

---

#### Controller API (Node.js) — Modules & Log Points

**`routes/*` (Request layer)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Request received | INFO | `method`, `path`, `query_params`, `request_id` |
| Response sent | INFO | `method`, `path`, `status_code`, `duration_ms` |
| Validation error | WARN | `path`, `validation_errors[]`, `body_received` (masked) |
| Not found | WARN | `path`, `resource_type`, `resource_id` |

**`services/*` (Business logic layer)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Run created | INFO | `run_id`, `proxy_id`, `run_mode`, `config_summary` |
| Run triggered → Runner | INFO | `run_id`, `proxy_count`, `runner_url` |
| Runner trigger fail | ERROR | `run_id`, `runner_url`, `error_detail` |
| Run status changed | INFO | `run_id`, `old_status`, `new_status` |
| Stop requested | INFO | `run_id`, `proxy_label`, `requested_by: "user"` |
| Stop forwarded → Runner | INFO | `run_id`, `runner_url` |
| Summary received | INFO | `run_id`, `score_total`, `total_samples` |
| Summary updated (rolling) | DEBUG | `run_id`, `score_total`, `running_for_ms` |
| Batch ingestion | INFO | `run_id`, `table`, `count` |
| Batch validation fail | ERROR | `run_id`, `invalid_count`, `first_error` |
| Password encrypted | DEBUG | `proxy_id` (KHÔNG log password) |
| Password encrypt fail | ERROR | `proxy_id`, `error_detail` |
| Service error | ERROR | `method_name`, `error_detail`, `input_params` |

**`db/pool` (Database layer)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Pool connected | INFO | `host`, `database`, `pool_size` |
| Pool connection fail | FATAL | `host`, `error_detail` |
| Query slow | WARN | `query_name`, `duration_ms` (khi > 1000ms) |
| Query error | ERROR | `query_name`, `error_detail`, `params` (masked) |

**`middleware/errorHandler`**:
| Event | Level | Log gì |
|-------|-------|--------|
| Unhandled error | ERROR | `error_message`, `stack_trace`, `request_id`, `path` |
| 500 returned | ERROR | `request_id`, `path`, `error_type` |

---

#### Target Service (Node.js) — Modules & Log Points

**`index` (Server startup)**:
| Event | Level | Log gì |
|-------|-------|--------|
| HTTP server started | INFO | `protocol: "http"`, `port: 3001` |
| HTTPS server started | INFO | `protocol: "https"`, `port: 3443`, `cert_path`, `key_path` |
| TLS cert loaded | INFO | `cert_subject`, `cert_expiry`, `cert_issuer` |
| TLS cert load fail | FATAL | `cert_path`, `error_detail` |
| All routes mounted | INFO | `routes: ["/health", "/echo", "/ip", "/large", "/slow", "/ws-echo"]` |

**`routes/*`**:
| Event | Level | Log gì |
|-------|-------|--------|
| Request received | DEBUG | `method`, `path`, `client_ip`, `headers.x-forwarded-for`, `server_port` (3001/3443), `protocol` (http/https) |
| Response sent | DEBUG | `path`, `status_code`, `response_size`, `duration_ms`, `server_port`, `protocol` |
| Large payload generated | INFO | `size_bytes`, `duration_ms`, `server_port`, `protocol` |
| Slow endpoint delay | DEBUG | `delay_ms`, `server_port`, `protocol` |
| Echo request received | DEBUG | `method`, `body_size`, `headers_count`, `server_port`, `protocol` |

**`ws/wsEcho`**:
| Event | Level | Log gì |
|-------|-------|--------|
| WS connection opened | INFO | `client_ip`, `hold_ms` (from query param), `protocol`, `server_port` |
| WS message echoed | DEBUG | `message_size`, `client_ip`, `protocol`, `server_port` |
| WS pong received from client | DEBUG | `client_ip`, `protocol`, `server_port` |
| WS hold duration reached | INFO | `client_ip`, `duration_ms`, `hold_ms`, `protocol`, `server_port` |
| WS connection closed | INFO | `client_ip`, `duration_ms`, `messages_count`, `close_reason`, `protocol`, `server_port` |
| WS error | ERROR | `client_ip`, `error_detail`, `protocol`, `server_port` |

#### Dashboard (Next.js) — Modules & Log Points

> **Cập nhật v1.5**: Mở rộng từ 13 → 49 log points. Chi tiết đầy đủ xem `sprint-2/SPRINT-2-PLAN.md`.
> Tóm tắt theo module dưới đây. Mỗi nhánh (success/fail/error variant) có log riêng.

**`startup` module (Server-side — 1 log)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Dashboard started | INFO | `api_url`, `node_env`, `log_level`, `module: "startup"` |

**`api-client` module (Server-side — 10 logs)**:
| Event | Level | Log gì | Ghi chú |
|-------|-------|--------|---------|
| API call start | DEBUG | `method`, `endpoint`, `params` | Mọi request |
| API call success | DEBUG | `method`, `endpoint`, `duration_ms`, `status_code` (200/201) | 2xx có body |
| API call success (no content) | DEBUG | `method`, `endpoint`, `duration_ms`, `status_code: 204` | DELETE success |
| API call not found (suppressed) | DEBUG | `method`, `endpoint`, `duration_ms`, `status_code: 404` | `suppressNotFound: true` — summary/samples chưa có |
| API client error (4xx) | WARN | `method`, `endpoint`, `status_code`, `error_detail`, `validation_errors` | 400/404/409 — lỗi từ client |
| API server error (5xx) | ERROR | `method`, `endpoint`, `status_code`, `error_detail` | 500+ — lỗi từ server |
| API timeout | ERROR | `method`, `endpoint`, `timeout_ms`, `api_url` | Request quá timeout |
| API connection refused | ERROR | `api_url`, `error_detail: "ECONNREFUSED"` | API service down |
| API unreachable | ERROR | `api_url`, `error_detail` | DNS/network error khác |
| API response parse error | ERROR | `method`, `endpoint`, `status_code`, `raw_body` (truncated 200 chars) | JSON invalid |

> **Thay đổi vs v1.2**: "API call fail" tách thành "API client error (4xx)" WARN + "API server error (5xx)" ERROR. "API unreachable" bổ sung thêm "API timeout" + "API connection refused" riêng biệt. Thêm "suppressed 404" cho polling summary.

**`pages/providers` module (Server-side — 6 logs)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Provider created | INFO | `provider_name` |
| Provider updated | INFO | `provider_id`, `provider_name`, `fields_changed[]` |
| Provider deleted | INFO | `provider_id`, `provider_name` |
| Provider create fail | WARN | `provider_name`, `error_detail` |
| Provider update fail | WARN | `provider_id`, `error_detail` |
| Provider delete fail | ERROR | `provider_id`, `error_detail` |

**`pages/proxies` module (Server-side — 6 logs)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Proxy created | INFO | `proxy_label`, `provider_id` |
| Proxy updated | INFO | `proxy_id`, `proxy_label`, `fields_changed[]`, `password_changed: true/false` |
| Proxy deleted | INFO | `proxy_id`, `proxy_label`, `provider_name` |
| Proxy create fail | WARN | `proxy_label`, `error_detail` |
| Proxy update fail | WARN | `proxy_id`, `error_detail` |
| Proxy delete fail | ERROR | `proxy_id`, `error_detail` |

> **Security**: `password_changed` chỉ log boolean. KHÔNG BAO GIỜ log password value.

**`pages/test` module (Server-side — 5 logs)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Test config customized | INFO | `config` (http_rpm, https_rpm, timeout_ms, warmup), `is_default: false` |
| Test runs created | INFO | `run_ids[]`, `proxy_count` |
| Test started | INFO | `run_ids[]`, `proxy_count`, `started_by: "user"` |
| Test start fail (create) | ERROR | `proxy_id`, `error_detail`, `created_so_far` |
| Test start fail (trigger) | ERROR | `run_ids[]`, `error_detail` |

**`pages/runs` module (Server-side — 2 logs)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Test stopped | INFO | `run_id`, `proxy_label`, `stopped_by: "user"`, `running_for_ms` |
| Test stop fail | ERROR | `run_id`, `error_detail` |

**`pages/error-boundary` module (Server-side — 4 logs)**:
| Event | Level | Log gì |
|-------|-------|--------|
| Page error (global) | ERROR | `page_path`, `error_detail`, `error_digest` |
| Page error (providers) | ERROR | `page_path: "/providers"`, `error_detail` |
| Page error (runs list) | ERROR | `page_path: "/runs"`, `error_detail` |
| Page error (overview) | ERROR | `page_path: "/"`, `error_detail` |

> **Export requested**: Deferred to Sprint 4 (export feature).

**Browser console (client-side — chỉ dev, 15 logs)**:

*usePolling hook (6 logs)*:
| Event | Level | Log gì |
|-------|-------|--------|
| [poll] started | console.debug | `interval`, `source` (component name) |
| [poll] success | console.debug | `interval`, `source` |
| [poll] fail | console.warn | `error` message, `source` |
| [poll] paused | console.debug | `reason: "enabled=false"`, `source` |
| [poll] resumed | console.debug | `interval`, `source` |
| [poll] cleanup | console.debug | `reason: "unmount"`, `source` |

*Run Detail page (6 logs)*:
| Event | Level | Log gì |
|-------|-------|--------|
| Run status changed | console.info | `run_id`, `old_status`, `new_status` |
| First summary received | console.info | `run_id`, `score_total`, `total_samples` |
| Realtime polling started | console.debug | `run_id`, `interval_ms` |
| Realtime polling stopped | console.debug | `run_id`, `reason` (completed/failed/unmount) |
| Run summary fetch failed | console.warn | `run_id`, `error` |
| Run samples fetch failed | console.warn | `run_id`, `error` |

*Form validation (3 logs)*:
| Event | Level | Log gì |
|-------|-------|--------|
| Form validation failed (provider) | console.warn | `form_name: "provider"`, `fields_with_errors[]` |
| Form validation failed (proxy) | console.warn | `form_name: "proxy"`, `fields_with_errors[]` |
| Form validation failed (test_config) | console.warn | `form_name: "test_config"`, `fields_with_errors[]` |

> **Chart render error**: Deferred to Sprint 4 (charts feature).

**Tổng kết Dashboard Logging — 49 log points**:

| Module | Server (pino) | Client (console) | Tổng |
|--------|--------------|------------------|------|
| Startup | 1 | 0 | 1 |
| api-client | 10 | 0 | 10 |
| pages/providers | 6 | 1 | 7 |
| pages/proxies | 6 | 1 | 7 |
| pages/test | 5 | 1 | 6 |
| pages/runs | 2 | 6 | 8 |
| usePolling | 0 | 6 | 6 |
| pages/error-boundary | 4 | 0 | 4 |
| **Tổng** | **34** | **15** | **49** |

---

### 9.4 Security trong Logging

**KHÔNG BAO GIỜ log**:
- Proxy password / credentials
- Full database connection string (mask password)
- Auth tokens

**Luôn mask**:
- `db_url` → `postgres://proxytest:***@postgres:5432/proxytest`
- `auth_pass_enc` → KHÔNG log password dù đã encrypt

### 9.5 Log Libraries

| Service | Library | Lý do |
|---------|---------|-------|
| Go Runner | `log/slog` (stdlib Go 1.21+) | Built-in structured logging, JSON output, zero dependency |
| API (Node.js) | `pino` | Fastest Node.js JSON logger, structured, có log levels |
| Target (Node.js) | `pino` | Consistent với API |
| Dashboard (Next.js) | `pino` (server) + `console` (client) | SSR dùng pino, browser dùng console |

### 9.6 Log Configuration trong YAML

```yaml
logging:
  level: "info"              # minimum level: debug, info, warn, error, fatal
  format: "json"             # json hoặc text (text cho dev local)
  output: "stdout"           # stdout hoặc file path
  file_path: "./logs/runner.log"  # dùng khi output=file
  include_caller: true       # include file:line trong log (Go)
```

### 9.7 Correlation — Trace lỗi qua toàn bộ hệ thống

Mỗi test run tạo 1 `run_id`. `run_id` này xuất hiện trong **mọi log entry** liên quan, xuyên suốt tất cả services + goroutines:

**Ví dụ timeline đầy đủ** (user bấm Start → 7 phases → 4 goroutines → HTTPS timeout → user bấm Stop):
```
── Phase: startup ────────────────────────────────────────────────────────
Runner:     {"service":"runner", "module":"server.handler", "message":"Trigger received", "run_id":"abc-123", "proxy_count":1}

── Phase: connectivity ───────────────────────────────────────────────────
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Connectivity check start", "proxy_label":"BrightData-VN-1", "proxy_host":"proxy.brightdata.com", "proxy_port":22225, "phase":"connectivity"}
Runner:     {"service":"runner", "module":"proxy.dialer", "message":"TCP connect success", "proxy_label":"BrightData-VN-1", "connect_ms":45, "phase":"connectivity"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Connectivity check pass", "connect_ms":45, "phase":"connectivity"}

── Phase: ip_check ───────────────────────────────────────────────────────
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"IP check start", "proxy_label":"BrightData-VN-1", "phase":"ip_check"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"IP check complete", "observed_ip":"103.1.2.3", "geo_match":true, "phase":"ip_check"}

── Phase: warmup ─────────────────────────────────────────────────────────
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Warmup start", "warmup_count":5, "phase":"warmup"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "seq":1, "method":"GET", "message":"Warmup request success", "total_ms":85, "phase":"warmup"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "seq":2, "method":"GET", "message":"Warmup request success", "total_ms":78, "phase":"warmup"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Warmup complete", "warmup_count":5, "success_count":5, "fail_count":0, "avg_ms":82, "phase":"warmup"}

── Phase: continuous ─────────────────────────────────────────────────────
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Continuous phase start", "goroutines":["http","https","ws","summary"], "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"HTTP transport created", "proxy_url":"http://proxy.brightdata.com:22225", "timeout_ms":10000, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"HTTP goroutine started", "http_rpm":500, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"HTTPS transport created", "proxy_url":"http://proxy.brightdata.com:22225", "timeout_ms":10000, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"HTTPS goroutine started", "https_rpm":500, "phase":"continuous"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"All 4 goroutines running", "http_rpm":500, "https_rpm":500, "ws_mpm":60, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"HTTP request success", "method":"POST", "request_type":"echo", "seq":10, "total_ms":85, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"CONNECT tunnel success", "seq":10, "connect_tunnel_ms":35, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"TLS handshake success", "seq":10, "tls_version":"TLS 1.3", "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"HTTPS response received", "method":"GET", "request_type":"echo", "seq":10, "total_ms":145, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"HTTPS request fail", "method":"GET", "error_type":"timeout", "seq":42, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"HTTP request success", "method":"GET", "request_type":"bandwidth", "seq":61, "total_ms":350, "bytes_received":1048576, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"IP stability check", "observed_ip":"103.1.2.3", "ip_changed":false, "request_type":"ip_check", "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.ws_tester", "goroutine":"ws", "message":"Connection start", "connection_num":1, "protocol":"ws", "target_url":"ws://target:3001/ws-echo", "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.ws_tester", "goroutine":"ws", "message":"WS upgrade success", "handshake_ms":120, "connection_num":1, "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.ws_tester", "goroutine":"ws", "message":"Per-connection summary", "connection_num":1, "protocol":"ws", "messages_sent":60, "drop_count":0, "avg_rtt_ms":15, "connection_held_ms":60000, "disconnect_reason":"client_close", "phase":"continuous"}
Runner:     {"service":"runner", "module":"proxy.ws_tester", "goroutine":"ws", "message":"Connection start", "connection_num":2, "protocol":"wss", "target_url":"wss://target:3443/ws-echo", "phase":"continuous"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "goroutine":"summary", "message":"Rolling summary", "total_http":1500, "total_https":1480, "total_ws":30, "score_total":0.85, "phase":"continuous"}
API:        {"service":"api", "module":"services.runService", "message":"Summary received", "run_id":"abc-123", "score_total":0.85}

── Phase: stopping ───────────────────────────────────────────────────────
API:        {"service":"api", "module":"services.runService", "message":"Stop requested", "run_id":"abc-123"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Stop signal received", "total_samples_so_far":2980, "running_for_ms":185000, "phase":"stopping"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Draining in-flight requests", "pending_goroutines":["http","https","ws"], "drain_timeout_ms":10000, "phase":"stopping"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"Cancel signal received", "seq":1500, "phase":"stopping"}
Runner:     {"service":"runner", "module":"proxy.http_tester", "goroutine":"http", "message":"HTTP goroutine stopped", "total_requests":1500, "per_method_count":{"GET":250,"POST":250,"PUT":250,"PATCH":250,"DELETE":250,"HEAD":250}, "phase":"stopping"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"Cancel signal received", "seq":1480, "phase":"stopping"}
Runner:     {"service":"runner", "module":"proxy.https_tester", "goroutine":"https", "message":"HTTPS goroutine stopped", "total_requests":1480, "per_method_count":{"GET":248,"POST":247,"PUT":247,"PATCH":246,"DELETE":246,"HEAD":246}, "phase":"stopping"}
Runner:     {"service":"runner", "module":"proxy.ws_tester", "goroutine":"ws", "message":"Cancel signal received", "connection_num":45, "phase":"stopping"}
Runner:     {"service":"runner", "module":"proxy.ws_tester", "goroutine":"ws", "message":"WS goroutine stopped", "total_connections":45, "ws_connections":23, "wss_connections":22, "total_messages_sent":2700, "total_drops":2, "phase":"stopping"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"All goroutines stopped", "total_goroutine_stop_ms":2500, "phase":"stopping"}

── Phase: final_summary ──────────────────────────────────────────────────
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Final summary", "final_score":0.85, "total_http_samples":1500, "total_https_samples":1480, "total_ws_samples":30, "total_duration_ms":185000, "phase":"final_summary"}
Runner:     {"service":"runner", "module":"engine.orchestrator", "message":"Orchestrator complete", "final_status":"completed", "phase":"final_summary"}
Dashboard:  {"service":"dashboard", "message":"Test stopped", "run_id":"abc-123", "stopped_by":"user"}
```

**Filter theo nhiều chiều**:
```bash
# ── Filter cơ bản ──────────────────────────────────────────────────────

# Tất cả logs của 1 run (sorted by time)
docker compose logs | jq 'select(.run_id == "abc-123")' | jq -s 'sort_by(.timestamp)'

# Chỉ lỗi của 1 run
docker compose logs | jq 'select(.run_id == "abc-123" and .level == "ERROR")'

# ── Filter theo goroutine ──────────────────────────────────────────────

# Chỉ goroutine HTTP (plain) của 1 run
docker compose logs | jq 'select(.run_id == "abc-123" and .goroutine == "http")'

# Chỉ goroutine HTTPS (CONNECT tunnel) của 1 run
docker compose logs | jq 'select(.run_id == "abc-123" and .goroutine == "https")'

# Chỉ goroutine WS của 1 run
docker compose logs | jq 'select(.run_id == "abc-123" and .goroutine == "ws")'

# So sánh HTTP vs HTTPS performance (success only)
docker compose logs | jq 'select(.goroutine == "http" and .message == "HTTP request success")'
docker compose logs | jq 'select(.goroutine == "https" and .message == "HTTPS response received")'

# ── Filter theo phase ──────────────────────────────────────────────────

# Chỉ warmup phase (xem warmup có ổn không)
docker compose logs | jq 'select(.run_id == "abc-123" and .phase == "warmup")'

# Chỉ connectivity phase (xem proxy có connect được không)
docker compose logs | jq 'select(.run_id == "abc-123" and .phase == "connectivity")'

# Chỉ stopping phase (xem graceful shutdown diễn ra thế nào)
docker compose logs | jq 'select(.run_id == "abc-123" and .phase == "stopping")'

# ── Filter theo error type ─────────────────────────────────────────────

# Tất cả lỗi timeout
docker compose logs | jq 'select(.error_type == "timeout")'

# Tất cả lỗi CONNECT tunnel (HTTPS/WSS specific)
docker compose logs | jq 'select(.error_type | test("connect_tunnel"))'

# Tất cả lỗi TLS (HTTPS/WSS specific)
docker compose logs | jq 'select(.error_type | test("^tls_"))'

# ── Filter theo method ─────────────────────────────────────────────────

# Chỉ POST requests failed
docker compose logs | jq 'select(.method == "POST" and .level == "ERROR")'

# So sánh latency theo method (HTTP goroutine)
docker compose logs | jq 'select(.goroutine == "http" and .message == "HTTP request success")' | jq '{method, total_ms}'

# ── Filter theo request_type ───────────────────────────────────────────

# Chỉ bandwidth test (GET /large)
docker compose logs | jq 'select(.request_type == "bandwidth")'

# Chỉ IP stability checks
docker compose logs | jq 'select(.request_type == "ip_check")'

# Chỉ timeout test (GET /slow)
docker compose logs | jq 'select(.request_type == "timeout_test")'

# ── Filter nâng cao ───────────────────────────────────────────────────

# HTTPS request gãy ở giai đoạn nào? (filter by message pattern)
docker compose logs | jq 'select(.goroutine == "https" and .level == "ERROR")' | jq '{seq, message, error_type}'
# → "CONNECT tunnel fail" = gãy giai đoạn 1
# → "TLS handshake fail" = gãy giai đoạn 2
# → "HTTPS request fail" = gãy giai đoạn 3

# Sample channel issues (performance bottleneck)
docker compose logs | jq 'select(.message | test("channel"))'

# Target Service: phân biệt request HTTP vs HTTPS
docker compose logs target | jq 'select(.server_port == 3001)'   # HTTP requests
docker compose logs target | jq 'select(.server_port == 3443)'   # HTTPS requests
```

---

## 10. Error Classification (see also Section 9.3 for log points)

| Type | Điều kiện | Xảy ra ở đâu |
|------|-----------|--------------|
| `timeout` | Request vượt request_timeout_ms | HTTP, HTTPS, WS |
| `connection_refused` | TCP tới proxy bị từ chối | Tất cả |
| `proxy_auth_failed` | Proxy trả 407 | HTTP, HTTPS CONNECT, WS |
| `proxy_error` | Proxy trả 502/503/504 | HTTP, HTTPS CONNECT |
| `proxy_rejected` | Proxy trả 403 (block target) | HTTPS CONNECT |
| `connect_tunnel_failed` | CONNECT không trả 200 | HTTPS, WSS |
| `connect_tunnel_timeout` | CONNECT timeout | HTTPS, WSS |
| `tls_handshake_failed` | TLS handshake fail (chung) | HTTPS, WSS |
| `tls_cert_expired` | Certificate hết hạn | HTTPS, WSS |
| `tls_cert_untrusted` | Certificate không trusted | HTTPS, WSS |
| `tls_hostname_mismatch` | Certificate hostname không khớp | HTTPS, WSS |
| `tls_version_unsupported` | Server không hỗ trợ TLS version yêu cầu | HTTPS, WSS |
| `connection_reset` | Connection reset by peer | Tất cả |
| `ws_upgrade_failed` | WebSocket upgrade bị reject (not 101) | WS, WSS |
| `pong_timeout` | Ping gửi nhưng không nhận pong (3x consecutive) | WS, WSS |
| `proxy_close` | Proxy đóng WS connection không expected | WS, WSS |
| `error` | WS runtime error (send/receive fail) | WS, WSS |
| `unknown` | Chưa phân loại | Tất cả |

---

## 11. Docker Compose (Local Only)

> **Deploy strategy**: Chỉ chạy local bằng Docker Compose. Không cần VPS, cloud, hay CI/CD.
> Khi nào muốn deploy lên VPS, chỉ cần copy code + `docker compose up -d` là xong.

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: proxytest
      POSTGRES_PASSWORD: proxytest
      POSTGRES_DB: proxytest
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro

  target:
    build: ./target
    ports:
      - "3001:3001"               # HTTP
      - "3443:3443"               # HTTPS (self-signed TLS)

  api:
    build: ./api
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgres://proxytest:proxytest@postgres:5432/proxytest
    depends_on:
      - postgres

  runner:
    build: ./runner
    ports:
      - "9090:9090"                    # internal API để nhận trigger từ Controller API
    environment:
      - DATABASE_URL=postgres://proxytest:proxytest@postgres:5432/proxytest
      - API_URL=http://api:8000/api/v1
      - RUNNER_PORT=9090
    depends_on: [postgres, target, api]
    # Runner chạy cùng lúc với API — long-running process, chờ lệnh
    # Password proxy lưu trong DB (encrypted), không cần env var cho mỗi provider

  dashboard:
    build: ./dashboard
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
    depends_on: [api]

volumes:
  pgdata:
```

**Cách dùng (local)**:
```bash
# Start tất cả services 1 lần duy nhất
docker compose up -d

# Xong! Mở browser → http://localhost:3000
# Nhập provider → nhập proxy → bấm Run Test → xem kết quả

# Xem logs nếu cần debug
docker compose logs -f runner
docker compose logs -f api
```

> Anh chỉ cần chạy `docker compose up -d` **1 lần**. Sau đó tất cả tương tác qua Dashboard UI.

---

## 12. Sprint Breakdown

> Sprint order thay đổi: Dashboard UI lên **Sprint 2** vì UI là nơi nhập liệu chính.

### Sprint 1 — Foundation (Week 1-2)
- [ ] Database schema (7 tables, có `is_https` + `http_rpm`/`https_rpm`) + Docker Compose + PG
- [ ] Target Service: `/health`, `/ip`, `/echo` (ALL methods), `/large`, `/slow` — listen HTTP (:3001) + HTTPS (:3443)
- [ ] Controller API: full CRUD providers + proxies + runs + batch ingestion
- [ ] Go Runner: `http_tester.go` (plain HTTP, test 6 methods, 500 RPM)
- [ ] Go Runner: `https_tester.go` (HTTPS qua CONNECT tunnel, test 6 methods, 500 RPM)
- [ ] Go Runner: 4 goroutines per proxy (HTTP, HTTPS, WS placeholder, Summary)
- [ ] Go Runner: long-running mode (HTTP server nhận trigger từ API)
- [ ] Go Runner: db insert + api_reporter, result_collector, scorer (uptime+latency+jitter)
- **Output**: API hoạt động, Runner test 1 proxy (HTTP + HTTPS riêng biệt, đủ 6 methods), kết quả vào PG

### Sprint 2 — Dashboard UI + Basic Flow (Week 3-4)
- [ ] Dashboard: Nhập Provider (form) + Nhập Proxy (form với host/port/user/pass)
- [ ] Dashboard: Chọn proxies → bấm **"Start Test"** → trigger API → Runner chạy liên tục
- [ ] Dashboard: Nút **"Stop Test"** → dừng test gracefully
- [ ] Dashboard: Xem trạng thái run realtime (running/stopping/completed/failed)
- [ ] Dashboard: Xem kết quả cập nhật mỗi 30 giây (score, latency, uptime)
- [ ] Password encryption (AES-256-GCM) trong DB
- **Output**: Flow hoàn chỉnh: nhập proxy → Start → xem realtime → Stop khi đủ

### Sprint 3 — WebSocket + IP Check + Parallel (Week 5-6)
- [ ] Target Service: `/ws-echo` (WebSocket echo + keep-alive)
- [ ] Go Runner: ws_tester, ip_check (blacklist + geo)
- [ ] Go Runner: scheduler (song song tối đa 10 proxies, semaphore), concurrency burst
- [ ] Scoring: thêm S_ws + S_security
- [ ] Dashboard: chọn nhiều proxy → test song song → hiển thị WS/IP/Score (comparison view → Sprint 4)
- **Output**: Full pipeline HTTP+HTTPS+WS, test song song, IP check

### Sprint 4 — Advanced Dashboard + Export (Week 7-8)
- [ ] Dashboard: Charts chi tiết (LatencyChart, UptimeTimeline, ScoreGauge)
- [ ] Dashboard: Comparison page (radar chart so sánh providers)
- [ ] Dashboard: Export JSON/CSV
- [ ] Dashboard: Xem log lỗi chi tiết per run
- **Output**: UI hoàn chỉnh với charts + so sánh + export

---

## 13. Verification per Sprint

### Sprint 1 — Foundation
1. `docker compose up -d` → tất cả services start (gồm cả target:3443 HTTPS)
2. `curl http://localhost:3001/ip` → Target trả IP (HTTP)
3. `curl https://localhost:3443/ip -k` → Target trả IP (HTTPS, self-signed)
4. `curl -X POST http://localhost:3001/echo -d '{"test":true}'` → Echo body (POST method)
5. `curl -X PUT http://localhost:3001/echo -d '{"update":true}'` → Echo body (PUT method)
6. `curl -X DELETE http://localhost:3001/echo` → Delete response
7. `curl -I http://localhost:3001/echo` → HEAD response (headers only)
8. `curl -X POST http://localhost:8000/api/v1/providers` → API tạo provider
9. `curl -X POST http://localhost:8000/api/v1/proxies` → API tạo proxy
10. Trigger run qua API → Runner nhận lệnh → test 1 proxy → kết quả vào PG
11. Verify **HTTP goroutine**: `http_sample` rows có `is_https=false`, `method` xoay vòng 6 methods
12. Verify **HTTPS goroutine**: `http_sample` rows có `is_https=true`, `tls_handshake_ms > 0`, `method` xoay vòng 6 methods
13. Verify warmup samples có `is_warmup = true`, summary exclude warmup
14. Verify RPM split: ~500 HTTP samples + ~500 HTTPS samples per minute

### Sprint 2 — Dashboard UI
1. Mở `http://localhost:3000` → Dashboard loads
2. Nhập provider qua form UI → lưu thành công
3. Nhập proxy (host/port/user/pass) qua form UI → password không hiện lại
4. Chọn 1 proxy → bấm "Start Test" → trạng thái = running
5. Chờ 30 giây → score + latency + uptime xuất hiện và cập nhật
6. Bấm "Stop Test" → trạng thái = stopping → completed
7. Đóng browser, mở lại → kết quả vẫn còn
8. Start test mới → đóng browser → mở lại → test vẫn đang chạy (running)

### Sprint 3 — WebSocket + Parallel
1. WS test: `ws_sample` rows có `connection_held_ms`, `disconnect_reason`
2. IP check: `ip_check_result` có `geo_match`, `is_clean`
3. Chọn 3+ proxies → bấm "Run Test" → tất cả test song song
4. 1 proxy fail → proxy kia vẫn complete
5. Score có đủ 5 components (uptime, latency, jitter, ws, security)

### Sprint 4 — Advanced Dashboard
1. Run detail: latency chart + uptime timeline render đúng
2. Comparison page: chọn 2+ providers → radar chart hiện
3. Export JSON → file download đầy đủ
4. Xem error logs per run → thấy chi tiết lỗi từng phase
