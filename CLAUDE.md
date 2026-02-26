# CLAUDE.md — Proxy Stability Test System

Project context file for AI-assisted development.

## Project Overview

A proxy stability testing system that evaluates **static residential proxies** (HTTP/HTTPS + WebSocket) for reliability, latency, security, and quality. Designed to select the best proxy provider for a Zalo account management system.

**Deploy**: Local only (Docker Compose)
**Scale**: 10 proxies / 10 providers in parallel, 1000 requests/min/proxy

## Architecture

4 services + PostgreSQL, all containerized via Docker Compose:

| Service | Language | Port(s) | Role |
|---------|----------|---------|------|
| **Runner** | Go | :8081 | Long-running test engine. 4 goroutines per proxy: HTTP, HTTPS, WS, Summary. Receives trigger from API. |
| **API** | Node.js/TypeScript (Express) | :3000 | Controller API. CRUD providers/proxies/runs, trigger Runner, serve results. |
| **Target** | Node.js/TypeScript | :3001 (HTTP), :3443 (HTTPS) | Self-hosted target service. Endpoints: /echo, /ip, /large, /slow, /health, /ws-echo. |
| **Dashboard** | Next.js 14 + Tailwind CSS | :3002 | UI for managing providers/proxies, starting tests, viewing results/charts. |
| **PostgreSQL** | PostgreSQL | :5432 | DB: provider, proxy_endpoint, test_run, http_sample, ws_sample, run_summary, ip_check_result |

## Tech Stack

- **Runner**: Go, `log/slog` (structured logging), `github.com/gorilla/websocket` (Sprint 3+)
- **API**: Node.js, TypeScript, Express, `pg` (PostgreSQL), `pino` (logging), `pino-http`
- **Target**: Node.js, TypeScript, Express, `pino`, self-signed TLS certs
- **Dashboard**: Next.js 14, React, Tailwind CSS, `recharts` (Sprint 4), client-side `console.*` logging
- **Database**: PostgreSQL with `uuid-ossp` extension

## Directory Structure (~121 files)

```
proxy-stability-test/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CLAUDE.md                           ← This file
│
├── requirements/                       ← Planning documents (10 files)
│   ├── PROXY-TEST-PLAN.md              ← Main plan: DB schema, architecture, logging spec, full file tree
│   ├── PLAN-EXPLANATION.md             ← Non-technical explanation of main plan
│   ├── sprint-1/
│   │   ├── SPRINT-1-PLAN.md            ← 9 tasks: Target, API, Runner HTTP/HTTPS, Engine, Reporter, Scorer, E2E
│   │   └── SPRINT-1-EXPLANATION.md
│   ├── sprint-2/
│   │   ├── SPRINT-2-PLAN.md            ← 9 tasks: Dashboard setup, API client, CRUD pages, Start/Stop flow, E2E
│   │   └── SPRINT-2-EXPLANATION.md
│   ├── sprint-3/
│   │   ├── SPRINT-3-PLAN.md            ← 9 tasks: WS echo, WS tester, IP check, Scheduler, Burst, Scoring, API, UI, E2E
│   │   └── SPRINT-3-EXPLANATION.md
│   └── sprint-4/
│       ├── SPRINT-4-PLAN.md            ← 8 tasks: Charts, Export, Compare, Error viewer, E2E
│       └── SPRINT-4-EXPLANATION.md
│
├── changelog/
│   └── CHANGELOG.md                    ← Full version history (v0.1 → v2.1)
│
├── database/                           ← 2 files
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── schema.sql                      # Full consolidated schema
│
├── runner/                             ← Go — ~16 files
│   ├── cmd/runner/main.go              # HTTP server chờ lệnh + CLI mode
│   ├── internal/
│   │   ├── server/handler.go           # HTTP endpoint nhận trigger từ API
│   │   ├── config/config.go            # Config parser
│   │   ├── proxy/
│   │   │   ├── dialer.go               # TCP connect qua proxy
│   │   │   ├── http_tester.go          # Plain HTTP test goroutine
│   │   │   ├── https_tester.go         # HTTPS qua CONNECT tunnel goroutine
│   │   │   ├── ws_tester.go            # WebSocket ws+wss goroutine
│   │   │   └── tls_inspector.go        # TLS version/cipher
│   │   ├── ipcheck/
│   │   │   ├── blacklist.go            # DNSBL lookup (4 servers)
│   │   │   └── geoip.go               # Geo verification (ip-api.com)
│   │   ├── engine/
│   │   │   ├── orchestrator.go         # Rate control, warmup, phased execution, burst
│   │   │   ├── scheduler.go            # Multi-proxy scheduling (max 10)
│   │   │   └── result_collector.go     # Aggregate samples, compute summary
│   │   ├── reporter/
│   │   │   ├── api_reporter.go         # POST kết quả tới API
│   │   │   └── db_reporter.go          # Insert trực tiếp vào PostgreSQL
│   │   ├── scoring/scorer.go           # 5-component scoring + weight redistribution
│   │   └── domain/types.go             # Shared structs
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── api/                                ← Node.js/TypeScript — ~15 files
│   ├── src/
│   │   ├── index.ts                    # Express app, mount routes, pino-http
│   │   ├── logger.ts                   # pino logger { service: "api" }
│   │   ├── db/pool.ts                  # PostgreSQL connection pool
│   │   ├── routes/
│   │   │   ├── index.ts               # Route registration
│   │   │   ├── providers.ts            # CRUD /api/v1/providers
│   │   │   ├── proxies.ts             # CRUD /api/v1/proxies
│   │   │   ├── runs.ts                # CRUD /api/v1/runs + trigger + stop
│   │   │   ├── results.ts            # GET samples, summary, ip-checks
│   │   │   └── export.ts              # GET /runs/:id/export, GET /providers/compare
│   │   ├── services/
│   │   │   ├── runService.ts           # Run lifecycle, trigger, status
│   │   │   ├── scoringService.ts       # Score computation helpers
│   │   │   └── exportService.ts        # JSON/CSV export, provider comparison
│   │   ├── middleware/
│   │   │   ├── pagination.ts           # Cursor-based pagination
│   │   │   └── errorHandler.ts         # Global error handler
│   │   └── types/index.ts              # Shared TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── target/                             ← Node.js/TypeScript — ~13 files
│   ├── src/
│   │   ├── index.ts                    # HTTP (:3001) + HTTPS (:3443) servers
│   │   ├── routes/
│   │   │   ├── echo.ts                 # ALL methods /echo
│   │   │   ├── ip.ts                   # GET /ip
│   │   │   ├── large.ts                # GET /large?size=N
│   │   │   ├── slow.ts                 # GET /slow?delay=N
│   │   │   └── health.ts
│   │   └── ws/wsEcho.ts                # WebSocket echo + ping/pong + hold
│   ├── certs/                          # Self-signed TLS (sibling of src/, NOT nested)
│   │   ├── generate-cert.sh            # openssl cert generation script
│   │   ├── server.key
│   │   └── server.crt
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── dashboard/                          ← Next.js 14 — ~75 files
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── .env.local.example
│   ├── package.json                    # react, next, tailwindcss, recharts
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── src/
│       ├── app/                        # Pages (8 files)
│       │   ├── layout.tsx              # Root layout: Sidebar + content
│       │   ├── globals.css
│       │   ├── error.tsx               # Global error boundary
│       │   ├── page.tsx                # Overview
│       │   ├── providers/page.tsx      # Provider + proxy management
│       │   ├── runs/page.tsx           # Runs list + status filter
│       │   ├── runs/[runId]/page.tsx   # Run detail: summary, charts, samples, errors
│       │   └── compare/page.tsx        # Provider comparison (radar chart)
│       ├── lib/                        # Utilities (2 files)
│       │   ├── logger.ts               # pino + console helpers
│       │   └── api-client.ts           # Fetch wrapper, error handling, 9 log points
│       ├── types/index.ts              # TypeScript types matching DB schema
│       ├── hooks/                      # React hooks (10 files)
│       │   ├── usePolling.ts           # Generic polling (interval, pause/resume)
│       │   ├── useProviders.ts         # CRUD providers
│       │   ├── useProxies.ts           # CRUD proxies by provider
│       │   ├── useRuns.ts              # Runs + WS samples + IP checks
│       │   ├── useRunDetail.ts         # Single run detail + polling
│       │   ├── useChartData.ts         # Time-bucket aggregation
│       │   ├── useSummaryHistory.ts    # Sliding window 200 snapshots
│       │   ├── useCompare.ts           # Provider comparison data
│       │   ├── useExport.ts            # Blob download (JSON/CSV)
│       │   └── useErrorLogs.ts         # Fetch + merge + filter errors
│       └── components/                 # React components (54 files)
│           ├── layout/Sidebar.tsx
│           ├── ui/                     # Reusable (11): Button, Badge, Card, Input, Select,
│           │                           #   Table, LoadingSpinner, ErrorAlert, EmptyState, Modal, ConfirmDialog
│           ├── providers/              # (3): ProviderList, ProviderForm, DeleteProviderDialog
│           ├── proxies/                # (4): ProxyList, ProxyForm, ProxyCard, DeleteProxyDialog
│           ├── test/                   # (3): ProxySelector, TestConfigForm, StartTestDialog
│           ├── runs/                   # (14): RunsList, RunsFilter, RunStatusBadge, RunHeader,
│           │                           #   RunSummaryCards, RunMetricsDetail, RunHttpSamples,
│           │                           #   RunWSSamples, RunIPCheck, RunScoreBreakdown,
│           │                           #   StopTestButton, ExportButton, ErrorLogViewer, ErrorLogFilters
│           ├── compare/                # (3): ProviderSelect, RadarCompareChart, ComparisonTable
│           ├── charts/                 # (8): ChartContainer, ChartTooltip, ChartErrorBoundary,
│           │                           #   chart-utils, LatencyChart, UptimeTimeline, ScoreGauge, ScoreHistoryChart
│           └── overview/               # (3): StatCards, ActiveRunsList, RecentResultsList
│
└── configs/                            # Sample YAML (advanced CLI mode)
    ├── single-proxy.yaml
    └── multi-proxy.yaml
```

## Sprint Overview

| Sprint | Scope | Key Deliverables |
|--------|-------|-----------------|
| **1** | Foundation | Target service (HTTP+HTTPS), API CRUD, Runner HTTP/HTTPS testers, Engine (orchestrator, scheduler, result collector), Reporter, Scorer (3 components), E2E |
| **2** | Dashboard UI | Next.js setup, API client + hooks, Provider/Proxy CRUD pages, Start/Stop test flow, Runs list, Run detail, Overview page, E2E |
| **3** | WS + Security | WS echo full impl, WS/WSS tester (gorilla/websocket), IP check (DNSBL + GeoIP), Multi-proxy scheduler (max 10), Burst test (100 goroutines), Scoring upgrade (3→5 components), E2E |
| **4** | Advanced Dashboard | recharts charts (Latency, Uptime, ScoreGauge, ScoreHistory), Export JSON/CSV, Provider comparison (radar chart), Error log viewer, E2E |

## Key Conventions

### Logging
- **Format**: Structured JSON for all services
- **Runner**: `log/slog` with fields: `module`, `goroutine`, `phase`, `proxy_id`, `run_id`
- **API**: `pino` + `pino-http` with fields: `module`, `run_id`, `proxy_id`
- **Target**: `pino` with fields: `module`, `server_port`, `protocol`
- **Dashboard**: `console.*` with `module` field convention
- **Password**: NEVER logged. `password_changed: boolean` only.

### Module Naming
- Runner: `proxy.http_tester`, `proxy.https_tester`, `proxy.ws_tester`, `engine.orchestrator`, `engine.scheduler`, `engine.result_collector`, `scoring.scorer`, `reporter.api_reporter`
- API: `routes.providers`, `routes.proxies`, `routes.runs`, `routes.results`, `routes.export`
- Target: `index`, `routes.echo`, `ws.wsEcho`
- Dashboard: `startup`, `api-client`, `pages.providers`, `charts.latency`, `pages.compare`, etc.

### Scoring Formula (Sprint 3+)
- **5 components**: Uptime (25%), Latency (25%), Jitter (15%), WebSocket (15%), Security (20%)
- **Weight redistribution** when phases skipped:
  - WS skipped: 0.294×U + 0.294×L + 0.176×J + 0.235×S
  - Security skipped: 0.3125×U + 0.3125×L + 0.1875×J + 0.1875×WS
  - Both skipped (Sprint 1/2): 0.385×U + 0.385×L + 0.230×J
- **Grades**: A (≥0.90), B (≥0.75), C (≥0.60), D (≥0.40), F (<0.40)

### Run Status Flow
`pending` → `running` → `stopping` → `completed` | `failed` | `cancelled`

### DB ↔ TypeScript Field Mappings
- DB `finished_at` → TS `ended_at` (terminal status timestamp)
- DB `stopped_at` → TS `stopped_at` (user-initiated stop timestamp)
- DB `tls_p50_ms` → TS `tls_handshake_p50_ms` (descriptive naming)

## Log Counts by Sprint

| Sprint | Server | Client | Total |
|--------|--------|--------|-------|
| 1 | ~90 | 0 | ~90 |
| 2 | 34 | 15 | 49 |
| 3 | 51 | 3 | 54 |
| 4 | 8 | 19 | 27 |

## Important Implementation Notes

1. **Encryption**: Proxy passwords encrypted with AES-256-GCM. Key from env var `ENCRYPTION_KEY` (32 bytes, hex-encoded). Generate: `openssl rand -hex 32`
2. **TLS Certs**: Target service self-signed cert: `openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt -days 3650 -nodes -subj '/CN=target'`. Auto-generate in Dockerfile/entrypoint.
3. **Warmup Filtering**: Runner sets `is_warmup=true`. API excludes warmup from `run_summary` aggregates. Both layers filter.
4. **WS CONNECT/TLS**: `gorilla/websocket` Dialer handles TCP→CONNECT→TLS→WS internally. Use custom `net.Dialer` for separate timing, or report combined.
5. **Protocol enum**: DB CHECK allows 'http', 'https', 'socks5'. Most HTTPS proxying uses `protocol='http'` + CONNECT tunnel. 'https' = native HTTPS proxy (rare).

## Document Map

| Question | File |
|----------|------|
| DB schema, architecture, logging spec | `requirements/PROXY-TEST-PLAN.md` |
| Sprint N implementation tasks | `requirements/sprint-N/SPRINT-N-PLAN.md` |
| Non-technical explanation | `requirements/sprint-N/SPRINT-N-EXPLANATION.md` |
| Version history | `changelog/CHANGELOG.md` |
| TypeScript types (Dashboard/API) | `requirements/sprint-2/SPRINT-2-PLAN.md` (Section: Shared Types) |
| Scoring formula + redistribution | `requirements/sprint-3/SPRINT-3-PLAN.md` (Task 6) |
| Export/Compare API | `requirements/sprint-4/SPRINT-4-PLAN.md` (Task 4) |
