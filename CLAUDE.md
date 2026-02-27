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
| **Runner** | Go | :9090 | Long-running test engine. 8 goroutines per proxy: HTTP, HTTPS, WS, WS-collector, Burst, Summary, Reporter, IP-recheck. Receives trigger from API. |
| **API** | Node.js/TypeScript (Express) | :8000 | Controller API. CRUD providers/proxies/runs, trigger Runner, serve results. |
| **Target** | Node.js/TypeScript | :3001 (HTTP), :3443 (HTTPS) | Self-hosted target service. Endpoints: /echo, /ip, /large, /slow, /health, /ws-echo. |
| **Dashboard** | Next.js 14 + Tailwind CSS | :3000 | UI for managing providers/proxies, starting tests, viewing results/charts. |
| **PostgreSQL** | PostgreSQL 16 (Docker) | :5433 (host) → :5432 (container) | DB: provider, proxy_endpoint, test_run, http_sample, ws_sample, run_summary, ip_check_result |

## Tech Stack

- **Runner**: Go, `log/slog` (structured logging), `github.com/gorilla/websocket` (Sprint 3+)
- **API**: Node.js, TypeScript, Express, `pg` (PostgreSQL), `pino` (logging), `pino-http`
- **Target**: Node.js, TypeScript, Express, `pino`, self-signed TLS certs
- **Dashboard**: Next.js 14, React, Tailwind CSS, `recharts` (Sprint 4), client-side `console.*` logging
- **Database**: PostgreSQL with `uuid-ossp` extension

## Current Directory Structure (Sprint 4 — ~135 source files)

```
proxy-stability-test/
├── docker-compose.yml                  # 4 services + postgres (port 5433)
├── .env.example
├── .env                                # Local config (gitignored)
├── .gitignore
├── CLAUDE.md                           ← This file
├── README.md
├── changelog/STATUS.md                 # Project status & change log
│
├── requirements/                       ← Planning documents (10 files)
│   ├── PROXY-TEST-PLAN.md
│   ├── PLAN-EXPLANATION.md
│   ├── sprint-1/SPRINT-1-PLAN.md
│   ├── sprint-1/SPRINT-1-EXPLANATION.md
│   ├── sprint-2/SPRINT-2-PLAN.md
│   ├── sprint-2/SPRINT-2-EXPLANATION.md
│   ├── sprint-3/SPRINT-3-PLAN.md
│   ├── sprint-3/SPRINT-3-EXPLANATION.md
│   ├── sprint-4/SPRINT-4-PLAN.md
│   └── sprint-4/SPRINT-4-EXPLANATION.md
│
├── changelog/
│   └── CHANGELOG.md
│
├── database/                           ← 3 files
│   ├── schema.sql                      # 7 tables + uuid-ossp
│   ├── migrations/001_initial_schema.sql
│   └── migrations/002_scoring_improvements.sql  # ip_clean_score, majority_tls_version, tls_version_score
│
├── runner/                             ← Go — 17 files
│   ├── cmd/runner/main.go              # HTTP server :9090, graceful shutdown
│   ├── internal/
│   │   ├── server/handler.go           # POST /trigger, POST /stop, GET /health
│   │   ├── config/config.go            # Parse ScoringConfig from trigger payload
│   │   ├── domain/types.go             # HTTPSample, WSSample, IPCheckResult, RunSummary, ScoringConfig
│   │   ├── proxy/
│   │   │   ├── dialer.go               # TCP connect + CONNECT tunnel
│   │   │   ├── http_tester.go          # HTTP test goroutine (500 RPM)
│   │   │   ├── https_tester.go         # HTTPS via CONNECT tunnel (500 RPM)
│   │   │   ├── ws_tester.go            # WS/WSS tester (gorilla/websocket, 60 msg/min)
│   │   │   └── tls_inspector.go        # TLS version/cipher extraction
│   │   ├── ipcheck/
│   │   │   ├── blacklist.go            # DNSBL lookup (4 servers: spamhaus, barracuda, spamcop, sorbs)
│   │   │   └── geoip.go               # GeoIP via ip-api.com (country/region/city)
│   │   ├── engine/
│   │   │   ├── orchestrator.go         # 5-phase lifecycle + IP re-check goroutine (60s), 8 goroutines per proxy
│   │   │   ├── scheduler.go            # Multi-proxy (max 10 parallel, semaphore)
│   │   │   └── result_collector.go     # Percentiles, HTTP + WS summary, MajorityTLSVersion
│   │   ├── reporter/
│   │   │   ├── api_reporter.go         # POST batches: HTTP samples, WS samples, IP checks, summary
│   │   │   └── db_reporter.go          # Direct DB insert (placeholder)
│   │   └── scoring/scorer.go           # 5-component scoring, configurable thresholds, weight redistribution
│   ├── go.mod                          # github.com/gorilla/websocket v1.5.3
│   ├── go.sum
│   └── Dockerfile
│
├── api/                                ← Node.js/TypeScript — 15 files
│   ├── src/
│   │   ├── index.ts                    # Express :8000, pino-http, CORS
│   │   ├── logger.ts
│   │   ├── db/pool.ts
│   │   ├── types/index.ts              # RunExport, ProviderComparison, ScoringConfig
│   │   ├── routes/
│   │   │   ├── index.ts
│   │   │   ├── providers.ts            # CRUD /api/v1/providers
│   │   │   ├── proxies.ts             # CRUD + AES-256-GCM encryption
│   │   │   ├── runs.ts                # CRUD + trigger + HTTP/WS batch + IP checks + summary (45 params)
│   │   │   ├── results.ts
│   │   │   └── export.ts              # GET /runs/:id/export?format=json|csv, GET /providers/compare
│   │   ├── services/
│   │   │   ├── runService.ts           # Pass scoring_config to Runner trigger
│   │   │   ├── scoringService.ts       # Placeholder
│   │   │   └── exportService.ts        # generateJSON, generateCSV, compareProviders
│   │   └── middleware/
│   │       ├── pagination.ts           # Cursor-based, MAX_LIMIT 5000
│   │       └── errorHandler.ts
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── target/                             ← Node.js/TypeScript — 10 files
│   ├── src/
│   │   ├── index.ts                    # HTTP :3001 + HTTPS :3443
│   │   ├── routes/
│   │   │   ├── echo.ts                 # ALL methods
│   │   │   ├── ip.ts
│   │   │   ├── large.ts                # Streaming response
│   │   │   ├── slow.ts                 # Delayed response
│   │   │   └── health.ts
│   │   └── ws/wsEcho.ts                # WS echo + ping/pong 10s + hold timer + structured logging
│   ├── certs/generate-cert.sh          # Auto-gen in Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── Dockerfile
│
└── dashboard/                          ← Next.js 14 + Tailwind CSS — 71 src files + 4 config
    ├── tailwind.config.ts              # Score colors, pulse-slow animation
    ├── postcss.config.js
    ├── .env.local.example
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx              # Root layout + Sidebar
    │   │   ├── page.tsx                # Overview (stat cards, active runs, recent results)
    │   │   ├── globals.css             # @tailwind directives + score utilities
    │   │   ├── error.tsx               # Global error boundary
    │   │   ├── providers/page.tsx      # Provider CRUD + inline proxy expansion
    │   │   ├── runs/page.tsx           # Runs list + status filter (Suspense)
    │   │   ├── runs/[runId]/page.tsx   # Run detail (6 tabs, realtime polling 3s)
    │   │   └── compare/page.tsx        # Provider comparison (radar + table)
    │   ├── lib/
    │   │   ├── api-client.ts           # Fetch wrapper, timeout, error classification
    │   │   └── logger.ts               # pino (server) + console helpers (client)
    │   ├── hooks/
    │   │   ├── usePolling.ts           # Generic polling with interval + enabled
    │   │   ├── useProviders.ts         # Provider CRUD
    │   │   ├── useProxies.ts           # Proxy CRUD (password_changed only)
    │   │   ├── useRuns.ts              # Runs fetch + status filter
    │   │   ├── useRunDetail.ts         # Parallel fetch (run + summary + HTTP + WS + IP) + stopRun
    │   │   ├── useChartData.ts         # Standalone: fetch 5000 samples, time-bucket aggregation
    │   │   ├── useSummaryHistory.ts    # Sliding window 200 summary snapshots
    │   │   ├── useExport.ts            # Blob download (fetch → createObjectURL → trigger)
    │   │   ├── useCompare.ts           # Fetch provider comparison data
    │   │   └── useErrorLogs.ts         # 3 independent fetches + merge + client-side filter
    │   ├── components/
    │   │   ├── layout/Sidebar.tsx      # Fixed sidebar, 4 nav items (Overview, Providers, Runs, Compare)
    │   │   ├── ui/                     # 11 components: Button, Badge, Card, Input, Select, Table, Modal, ConfirmDialog, LoadingSpinner, ErrorAlert, EmptyState
    │   │   ├── charts/                 # 8 files: ChartContainer, ChartTooltip, ChartErrorBoundary, chart-utils,
    │   │   │                           #   LatencyChart, UptimeTimeline, ScoreGauge, ScoreHistoryChart
    │   │   ├── compare/                # 3 files: ProviderSelect, RadarCompareChart, ComparisonTable
    │   │   ├── providers/              # ProviderList (expandable rows), ProviderForm, DeleteProviderDialog
    │   │   ├── proxies/                # ProxyList, ProxyForm, ProxyCard, DeleteProxyDialog
    │   │   ├── test/                   # ProxySelector, TestConfigForm (+scoring thresholds), StartTestDialog
    │   │   ├── runs/                   # 14 files: RunHeader, RunSummaryCards (6 cards), RunMetricsDetail (5-component),
    │   │   │                           #   RunHttpSamples, RunWSSamples (scroll), RunIPCheck, RunScoreBreakdown,
    │   │   │                           #   ExportButton, ErrorLogViewer, ErrorLogFilters,
    │   │   │                           #   RunsList, RunsFilter, RunStatusBadge, StopTestButton
    │   │   └── overview/               # StatCards, ActiveRunsList, RecentResultsList
    │   └── types/index.ts              # All types: Provider, Proxy, TestRun, RunSummary, HttpSample,
    │                                   #   WsSample, IPCheckResult, ScoringConfig, ErrorLogEntry, ProviderComparison
    ├── next.config.js                  # standalone output + API rewrites
    ├── package.json                    # recharts ^2.12.0
    ├── tsconfig.json
    └── Dockerfile                      # Multi-stage: deps → builder → runner
```

## Sprint Overview

| Sprint | Status | Scope | Key Deliverables |
|--------|--------|-------|-----------------|
| **1** | **DONE** | Foundation | Target service (HTTP+HTTPS), API CRUD, Runner HTTP/HTTPS testers, Engine (orchestrator, scheduler, result collector), Reporter, Scorer (3 components), E2E |
| **2** | **DONE** | Dashboard UI | Next.js + Tailwind setup, API client + hooks, Provider/Proxy CRUD pages, Start/Stop test flow, Runs list, Run detail, Overview page, CORS, E2E with real proxies |
| **3** | **DONE** | WS + Security | WS echo rewrite, WS/WSS tester (gorilla/websocket), IP check (DNSBL + GeoIP), Burst test (100 goroutines), Scoring upgrade (3→5 components), API WS/IP endpoints, Dashboard 4 tabs + 6 cards |
| **4** | **DONE** | Advanced Dashboard + Scoring Improvements | recharts charts (Latency, Uptime, ScoreGauge, ScoreHistory), Export JSON/CSV, Provider comparison (radar chart), Error log viewer, Scoring improvements (IP re-check, gradient IP, TLS version, configurable thresholds), Bug fixes (uptime calc, WS scoring, IP check) |

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
- **Sprint 4 improvements** (implemented): Configurable thresholds via `ScoringConfig`, IP clean gradient (`1 - listed/queried`), TLS version scoring (1.3=1.0, 1.2=0.7, other=0.3), IP stability periodic re-check (60s goroutine)
- **Bug fixes**: Uptime requires `StatusCode > 0 && < 400` (not just no error), WS score=0 when all fail, IP check validates HTTP 200

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
| 4 | 10 | 19 | 29 |

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
