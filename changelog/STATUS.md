# Project Status — Proxy Stability Test System

Last updated: 2026-02-26

---

## Sprint Progress

| Sprint | Status | Scope |
|--------|--------|-------|
| **Sprint 1** | **DONE** | Foundation — Target, API, Runner, Engine, Reporter, Scorer |
| **Sprint 2** | **DONE** | Dashboard UI — CRUD pages, Start/Stop flow, Run detail, Overview |
| Sprint 3 | Not started | WebSocket + IP Check + Multi-proxy scheduler + Burst |
| Sprint 4 | Not started | Charts, Export, Compare, Error log viewer |

---

## Sprint 1 — Completed (2026-02-26)

### Services Running

| Service | Port | Status | Image |
|---------|------|--------|-------|
| PostgreSQL 16 | 5433 (host) → 5432 (container) | Healthy | postgres:16 |
| Target | 3001 (HTTP), 3443 (HTTPS) | Healthy | node:20-alpine |
| API | 8000 | OK | node:20-alpine |
| Runner | 9090 | OK | golang:1.22-alpine → alpine:3.19 |
| Dashboard | 3000 | Running (full UI) | node:20-alpine |

### Database (7 tables)

| Table | Purpose | Sprint 1 Data |
|-------|---------|---------------|
| `provider` | Proxy providers | Yes |
| `proxy_endpoint` | Proxy connection details | Yes |
| `test_run` | Test run lifecycle | Yes |
| `http_sample` | HTTP/HTTPS request results | Yes |
| `ws_sample` | WebSocket results | Empty (Sprint 3) |
| `ip_check_result` | IP security checks | Empty (Sprint 3) |
| `run_summary` | Aggregated metrics + scores | Yes |

### Files Created (68 total)

| Component | Files | Key Files |
|-----------|-------|-----------|
| Infrastructure | 5 | docker-compose.yml, .env, .gitignore, schema.sql x2 |
| Target | 10 | index.ts, 5 routes, wsEcho.ts, certs, Dockerfile |
| API | 14 | index.ts, 6 routes, 2 services, 2 middleware, Dockerfile |
| Runner | 14 | main.go, handler.go, 4 proxy files, 3 engine, 2 reporter, scorer |
| Dashboard | 6 | Placeholder (layout.tsx, page.tsx, Dockerfile) |
| Docs | 19 | CLAUDE.md, README.md, STATUS.md, 10 plan files, CHANGELOG.md |

### API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/health` | Working |
| GET/POST/PUT/DELETE | `/api/v1/providers` | Working |
| GET/POST/PUT/DELETE | `/api/v1/proxies` | Working |
| GET/POST/DELETE | `/api/v1/runs` | Working |
| POST | `/api/v1/runs/start` | Working |
| POST | `/api/v1/runs/:id/stop` | Working |
| PATCH | `/api/v1/runs/:id/status` | Working |
| POST | `/api/v1/runs/:id/http-samples/batch` | Working |
| POST | `/api/v1/runs/:id/summary` | Working |
| GET | `/api/v1/runs/:id/http-samples` | Working |
| GET | `/api/v1/runs/:id/summary` | Working |
| GET | `/api/v1/results/summaries` | Working |

### E2E Test Results (2026-02-26)

```
Provider: TestProvider, ProxyVN Premium
Proxies: test-proxy-1, vn-residential-01
Runs: 2 completed

test-proxy-1:    HTTP 310/310 OK | HTTPS 386 errors | Score 0.554 (D)
vn-residential-01: HTTP 342/342 OK | HTTPS 387 errors | Score 0.563 (D)

Note: HTTPS errors expected — target:3001 is not a real proxy,
      so CONNECT tunnel fails. With real proxies, HTTPS will work.
```

### Scoring (Sprint 1 — 3 components)

```
Score = 0.385 × Uptime + 0.385 × Latency + 0.230 × Jitter

Grades: A (≥0.90) | B (≥0.75) | C (≥0.60) | D (≥0.40) | F (<0.40)
```

---

## Port Changes vs Plan

| Service | Plan | Actual | Reason |
|---------|------|--------|--------|
| Runner | :8081 | :9090 | Changed during implementation |
| API | :3000 | :8000 | Avoid conflict with Dashboard |
| Dashboard | :3002 | :3000 | Standard Next.js port |
| PostgreSQL | :5432 | :5433 (host) | Avoid conflict with local PG 18 |

## Database Access

| Method | Host | Port | User | Password | Database |
|--------|------|------|------|----------|----------|
| Docker internal | postgres | 5432 | postgres | 123 | proxytest |
| pgAdmin4 / host | localhost | 5433 | postgres | 123 | proxytest |

---

## Sprint 2 — Completed (2026-02-26)

### Dashboard (47 new files)

| Component | Files | Key Files |
|-----------|-------|-----------|
| Setup | 7 | tailwind.config.ts, postcss.config.js, globals.css, Dockerfile, .env.local.example, error.tsx, logger.ts |
| Layout | 1 | Sidebar.tsx (fixed sidebar, 3 nav items) |
| UI Components | 11 | Button, Badge, Card, Input, Select, Table, Modal, ConfirmDialog, LoadingSpinner, ErrorAlert, EmptyState |
| API + Types | 2 | api-client.ts (fetch wrapper, timeout, error classification), types/index.ts |
| Hooks | 5 | usePolling, useProviders, useProxies, useRuns, useRunDetail |
| Provider Page | 4 | page.tsx, ProviderList, ProviderForm, DeleteProviderDialog |
| Proxy Components | 4 | ProxyList, ProxyForm, ProxyCard, DeleteProxyDialog |
| Start Test | 3 | ProxySelector, TestConfigForm, StartTestDialog (3-step modal) |
| Runs List | 4 | page.tsx, RunsList, RunsFilter, RunStatusBadge |
| Run Detail | 6 | page.tsx, RunHeader, RunSummaryCards, RunMetricsDetail, RunHttpSamples, StopTestButton |
| Overview | 3 | StatCards, ActiveRunsList, RecentResultsList |

### API Fixes for Dashboard Integration

| Fix | File | Detail |
|-----|------|--------|
| CORS middleware | api/src/index.ts | Allow Dashboard :3000 → API :8000 cross-origin |
| Runs JOIN | api/src/routes/runs.ts | GET /runs and GET /runs/:id now return proxy_label, provider_name |
| cors package | api/package.json | Added `cors` + `@types/cors` |

### Runner Fix

| Fix | File | Detail |
|-----|------|--------|
| HTTPS target URL parsing | runner/internal/proxy/https_tester.go | Handle URLs without explicit port (e.g., ngrok URLs) — default to :443 for HTTPS, :80 for HTTP |

### External Proxy Testing

Requires ngrok (or public IP) to expose Target service to external proxies:
- Set `TARGET_HTTP_URL` and `TARGET_HTTPS_URL` in `.env` to ngrok tunnel URLs
- Restart `docker compose up -d api runner`

### E2E Verified with Real Proxies (2026-02-26)

```
Provider: TunProxy (tunproxy.com)
Proxies: VN-SNVT2 (snvt2.tunproxy.com), VN-SNVT9 (snvt9.tunproxy.com)

VN-SNVT2: HTTP 200 OK ✓ | HTTPS CONNECT+TLS 1.3 ✓ | TTFB ~300ms | Total ~600-1000ms
VN-SNVT9: HTTP 200 OK ✓ | HTTPS CONNECT+TLS 1.3 ✓ | Running in parallel

Target exposed via ngrok tunnel (free tier).
Scoring: 3 components (Uptime 38.5% + Latency 38.5% + Jitter 23.0%)
```

---

## Known Limitations (Sprint 2)

1. **WebSocket**: Goroutine exists but placeholder (Sprint 3)
2. **IP Check**: Placeholder (Sprint 3)
3. **Scoring**: 3 components only (Sprint 3 adds WS + Security = 5)
4. **Multi-proxy**: Single proxy only (Sprint 3 adds max 10 parallel)
5. **Charts/Export**: Not implemented (Sprint 4)
6. **External proxies**: Require ngrok or public IP to expose Target service
7. **No charts**: Run detail shows tables only, recharts added in Sprint 4

---

## How to Run

```bash
# From scratch
cp .env.example .env
docker compose up -d

# Check health
curl http://localhost:8000/health
curl http://localhost:9090/health
curl http://localhost:3001/health

# View logs
docker compose logs -f runner
docker compose logs -f api

# Stop
docker compose down

# Clean (remove DB data)
docker compose down -v
```
