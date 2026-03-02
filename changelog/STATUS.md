# Project Status — Proxy Stability Test System

Last updated: 2026-03-02

---

## Sprint Progress

| Sprint | Status | Scope |
|--------|--------|-------|
| **Sprint 1** | **DONE** | Foundation — Target, API, Runner, Engine, Reporter, Scorer |
| **Sprint 2** | **DONE** | Dashboard UI — CRUD pages, Start/Stop flow, Run detail, Overview |
| **Sprint 3** | **DONE** | WS tester, IP checker, Burst test, 5-component scoring, API WS/IP endpoints, Dashboard 4 tabs |
| **Sprint 4** | **DONE** | Charts (recharts), Export JSON/CSV, Compare radar, Error log viewer, Scoring improvements |

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
| `ws_sample` | WebSocket results | Populated (Sprint 3) |
| `ip_check_result` | IP security checks | Populated (Sprint 3) |
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

## Sprint 3 — Completed (2026-02-26)

### New Files (6)

| File | Purpose |
|------|---------|
| `runner/internal/proxy/ws_tester.go` | WS/WSS tester (gorilla/websocket, 60 msg/min, ping/pong, reconnection) |
| `runner/internal/ipcheck/blacklist.go` | DNSBL blacklist lookup (4 servers) |
| `runner/internal/ipcheck/geoip.go` | GeoIP country/region/city via ip-api.com |
| `dashboard/src/components/runs/RunWSSamples.tsx` | WS connections table (protocol, RTT, drops, held, disconnect) |
| `dashboard/src/components/runs/RunIPCheck.tsx` | IP check display (blacklist, geo, stability) |
| `dashboard/src/components/runs/RunScoreBreakdown.tsx` | 5-component score bars with grades |

### Modified Files (14)

| File | Changes |
|------|---------|
| `target/src/ws/wsEcho.ts` | Full rewrite: echo, ping/pong 10s, hold timer, structured logging |
| `runner/go.mod` | Added gorilla/websocket v1.5.3 |
| `runner/internal/domain/types.go` | Added WSSample, IPCheckResult, BurstConfig; expanded RunSummary |
| `runner/internal/engine/orchestrator.go` | IP check in Phase 1, WS/burst goroutines in Phase 3 (7 total) |
| `runner/internal/engine/result_collector.go` | Added ComputeWSSummary() |
| `runner/internal/scoring/scorer.go` | 3→5 component scoring with weight redistribution |
| `runner/internal/reporter/api_reporter.go` | Added ReportWSSamples(), ReportIPCheck() |
| `runner/internal/server/handler.go` | Isolated context per run for multi-proxy stop |
| `api/src/routes/runs.ts` | WS batch insert, IP check insert, GET ws-samples/ip-checks, summary ws/ip/score fields |
| `dashboard/src/types/index.ts` | Added WsSample, IPCheckResult interfaces |
| `dashboard/src/hooks/useRunDetail.ts` | 5 parallel fetches (run + summary + HTTP + WS + IP) |
| `dashboard/src/components/runs/RunSummaryCards.tsx` | 4→6 cards (WS RTT, IP Status) |
| `dashboard/src/components/runs/RunMetricsDetail.tsx` | WS metrics, 5-component scoring table |
| `dashboard/src/app/runs/[runId]/page.tsx` | 4 tabs: HTTP Samples, WS Connections, IP Check, Score Breakdown |

### New API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/v1/runs/:id/ws-samples/batch` | Working |
| POST | `/api/v1/runs/:id/ip-checks` | Working |
| GET | `/api/v1/runs/:id/ws-samples` | Working (paginated, protocol filter) |
| GET | `/api/v1/runs/:id/ip-checks` | Working |

### Scoring (Sprint 3 — 5 components)

```
Score = 0.25 × Uptime + 0.25 × Latency + 0.15 × Jitter + 0.15 × WS + 0.20 × Security

S_ws = 0.4*(1-wsErrorRate) + 0.3*(1-wsDropRate) + 0.3*wsHoldRatio
S_security = 0.30*ipClean + 0.25*geoMatch + 0.25*ipStable + 0.20*tlsScore

Weight redistribution when phases skipped:
- WS skipped: 0.294×U + 0.294×L + 0.176×J + 0.235×S
- Security skipped: 0.3125×U + 0.3125×L + 0.1875×J + 0.1875×WS
- Both skipped (Sprint 1/2 compat): 0.385×U + 0.385×L + 0.230×J

Grades: A (≥0.90) | B (≥0.75) | C (≥0.60) | D (≥0.40) | F (<0.40)
```

### Database Data (Sprint 3)

| Table | Sprint 3 Data |
|-------|---------------|
| `ws_sample` | Populated (WS/WSS connections with RTT, drops, hold, disconnect reason) |
| `ip_check_result` | Populated (observed IP, geo match, blacklist, stability) |
| `run_summary` | Extended with ws_*, ip_*, score_ws, score_security fields |

### Build Verified (2026-02-26)

```
Go build:        go build ./...     → clean
API TypeScript:  tsc --noEmit       → clean
Target TS:       tsc --noEmit       → clean
Dashboard:       next build         → clean (all routes)
Docker:          5 containers       → all healthy
API endpoints:   POST/GET ws-samples, ip-checks, summary → all working
Target WS echo:  connect + echo + hold timer → working (code 1000)
```

---

## Sprint 4 — Completed (2026-02-27)

### New Files (24)

| File | Purpose |
|------|---------|
| `dashboard/src/components/charts/ChartContainer.tsx` | Responsive chart wrapper (loading/empty/data states) |
| `dashboard/src/components/charts/ChartTooltip.tsx` | Custom recharts tooltip |
| `dashboard/src/components/charts/ChartErrorBoundary.tsx` | React error boundary for charts |
| `dashboard/src/components/charts/chart-utils.ts` | CHART_COLORS, formatMs, formatPercent, bucketByTime, percentile |
| `dashboard/src/components/charts/LatencyChart.tsx` | LineChart P50/P95/P99 latency over time |
| `dashboard/src/components/charts/UptimeTimeline.tsx` | ComposedChart stacked area (success/error) + uptime ratio line |
| `dashboard/src/components/charts/ScoreGauge.tsx` | RadialBarChart score gauge with grade center text |
| `dashboard/src/components/charts/ScoreHistoryChart.tsx` | LineChart score over time + grade threshold bands |
| `dashboard/src/hooks/useChartData.ts` | Standalone hook — fetches up to 5000 samples, time-bucket aggregation |
| `dashboard/src/hooks/useSummaryHistory.ts` | Accumulate summary snapshots (useRef, max 200, dedup 5s) |
| `dashboard/src/hooks/useExport.ts` | Blob download (fetch → URL.createObjectURL → trigger download) |
| `dashboard/src/hooks/useCompare.ts` | Fetch provider comparison data from API |
| `dashboard/src/hooks/useErrorLogs.ts` | 3 independent fetches (HTTP/WS/IP), merge + filter errors |
| `dashboard/src/components/runs/ExportButton.tsx` | JSON/CSV dropdown with spinner |
| `dashboard/src/components/runs/ErrorLogViewer.tsx` | Expandable error rows, source badges (HTTP=blue, WS=purple, IP=amber) |
| `dashboard/src/components/runs/ErrorLogFilters.tsx` | 3 filter selects (source, error_type, protocol) |
| `dashboard/src/app/compare/page.tsx` | Provider comparison page |
| `dashboard/src/components/compare/ProviderSelect.tsx` | Multi-select provider pills (min 2, max 5) |
| `dashboard/src/components/compare/RadarCompareChart.tsx` | RadarChart 5 axes (Uptime/Latency/Jitter/WS/Security) |
| `dashboard/src/components/compare/ComparisonTable.tsx` | Side-by-side metrics table |
| `api/src/services/exportService.ts` | generateJSON, generateCSV, compareProviders |
| `database/migrations/002_scoring_improvements.sql` | ALTER TABLE run_summary ADD ip_clean_score, majority_tls_version, tls_version_score |

### Modified Files (21+)

| File | Changes |
|------|---------|
| `dashboard/package.json` | Added recharts ^2.12.0 |
| `dashboard/src/types/index.ts` | Added ErrorLogEntry, ScoringConfig, ProviderComparison, chart types |
| `dashboard/src/app/runs/[runId]/page.tsx` | 4→6 tabs (+ Charts, + Errors), useChartData hook integration |
| `dashboard/src/components/runs/RunHeader.tsx` | Added ExportButton |
| `dashboard/src/components/runs/RunsList.tsx` | Added export action per completed row |
| `dashboard/src/components/runs/RunScoreBreakdown.tsx` | Gradient IP display (progress bar), TLS version score |
| `dashboard/src/components/runs/RunMetricsDetail.tsx` | TLS version string + score display |
| `dashboard/src/components/runs/RunWSSamples.tsx` | Added scroll (max-h-[600px]) + sticky thead |
| `dashboard/src/components/runs/RunSummaryCards.tsx` | Updated score display |
| `dashboard/src/components/layout/Sidebar.tsx` | 3→4 nav items (+ Compare) |
| `dashboard/src/components/test/TestConfigForm.tsx` | Collapsible "Scoring Thresholds" section (4 inputs) |
| `api/src/routes/export.ts` | Rewritten: GET /runs/:id/export?format=json\|csv, GET /providers/compare |
| `api/src/routes/index.ts` | Fixed route registration — export at root level |
| `api/src/routes/runs.ts` | Summary UPSERT extended to 45 params (+ 3 new scoring columns), scoring_config in start body |
| `api/src/types/index.ts` | Added RunExport, ProviderComparison, ScoringConfig interfaces |
| `api/src/services/runService.ts` | Pass scoring_config to Runner trigger |
| `api/src/middleware/pagination.ts` | MAX_LIMIT 100 → 5000 (chart data fix) |
| `runner/internal/domain/types.go` | Added ScoringConfig struct, DefaultScoringConfig(), MajorityTLSVersion/IPCleanScore/TLSVersionScore fields |
| `runner/internal/config/config.go` | Parse ScoringConfig from trigger payload |
| `runner/internal/scoring/scorer.go` | ComputeScore(summary, cfg), ipCleanGradient(), tlsVersionScore(), WS score=0 when all fail |
| `runner/internal/engine/orchestrator.go` | IP re-check goroutine (60s), ipMu mutex, pass ScoringConfig, IP check status code validation |
| `runner/internal/engine/result_collector.go` | MajorityTLSVersion computation, uptime: require StatusCode 200-399, WS drop rate 1.0 when all fail |

### Post-Implementation Bug Fixes

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Uptime 100% with all 404s | `result_collector.go` only checked `ErrorType == ""`, not StatusCode | Added `StatusCode > 0 && StatusCode < 400` check |
| WS score 0.301 when all WS fail | When `WSSuccessCount=0`, formula gave `0.3*(1-0)=0.3` | Short-circuit: if `WSSuccessCount == 0` → score = 0 |
| IP shows "Clean" without data | `getIPViaProxy` didn't validate HTTP response status (404 body used as IP) | Return empty if `resp.StatusCode != 200` |
| WS drop rate 0% when no messages sent | `totalSent=0` → division skipped → `WSDropRate=0` | Set `WSDropRate=1.0` when `successCount == 0` |
| Charts show only 1 data point | `useChartData` shared 50-sample fetch from `useRunDetail` | Refactored to standalone hook fetching 5000 samples |
| API caps chart data at 100 | `pagination.ts` `MAX_LIMIT=100` | Changed to `MAX_LIMIT=5000` |

### New API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/v1/runs/:id/export?format=json\|csv` | Working |
| GET | `/api/v1/providers/compare?provider_ids=a,b` | Working |

### Dashboard Updates

| Feature | Detail |
|---------|--------|
| Run Detail Tabs | 4→6 tabs: HTTP, WS, IP, Score, **Charts**, **Errors** |
| Sidebar Nav | 3→4 items: Overview, Providers, Runs, **Compare** |
| Charts | LatencyChart (P50/P95/P99), UptimeTimeline (stacked area), ScoreGauge (radial), ScoreHistoryChart (line + grade bands) |
| Export | JSON/CSV download button in RunHeader + RunsList |
| Compare Page | Multi-select providers, RadarChart 5 axes, ComparisonTable side-by-side |
| Error Log Viewer | Unified errors from HTTP+WS+IP, expandable rows, 3 filters |
| WS Connections Table | Scrollable (max-h-[600px]) with sticky header |

### Scoring Improvements (Sprint 3 Limitations → Fixed)

| # | Limitation (Sprint 3) | Fix (Sprint 4) |
|---|----------------------|-----------------|
| 1 | IP Stability hardcoded `true` | Periodic re-check every 60s (goroutine) |
| 2 | IP Clean binary 0/1 | Gradient scoring: `1 - listed/queried` |
| 3 | TLS scoring binary (has HTTPS = 1.0) | TLS 1.3=1.0, TLS 1.2=0.7, other=0.3 |
| 4 | Scoring thresholds hardcoded | Configurable `ScoringConfig` (latency_threshold_ms, jitter_threshold_ms, ws_hold_target_ms, ip_check_interval_sec) |

### Build Verified (2026-02-27)

```
Go build:        go build ./...     → clean
API TypeScript:  tsc --noEmit       → clean
Target TS:       tsc --noEmit       → clean
Dashboard:       tsc --noEmit + next build → clean (all routes)
Docker:          5 containers       → all healthy
```

---

## Post-Sprint Enhancements (2026-03-02)

### Quick Add Proxy (v6.2)

| Change | Detail |
|--------|--------|
| **NEW** `QuickAddProxyDialog.tsx` | Paste `host:port:user:pass` (multi-line batch), auto-parse, duplicate detection (DB + input), auto-label from subdomain |
| **Modified** `providers/page.tsx` | "Quick Add Proxy" button next to "Add Provider" |

**Dashboard: 72 src files (was 71). Total: ~136 source files.**

---

## Known Limitations

1. **External proxies**: Require ngrok or public IP to expose Target service
2. **No alerting**: No email/Slack notifications when test completes or proxy fails
3. **No authentication**: Dashboard has no login/auth
4. **No PDF export**: Only JSON/CSV supported
5. **No historical trending**: Compare page uses latest run only, no time-series comparison

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
