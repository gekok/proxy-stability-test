# Proxy Stability Test System

A comprehensive proxy stability testing system that evaluates **static residential proxies** (HTTP/HTTPS + WebSocket) for reliability, latency, security, and quality. Designed to select the best proxy provider for a Zalo account management system.

## Key Features

- **Multi-protocol testing**: HTTP, HTTPS (CONNECT tunnel), WebSocket (ws/wss)
- **Parallel testing**: Up to 10 proxies from 10 providers simultaneously at 1,000 requests/min/proxy
- **Comprehensive metrics**: TTFB, TCP connect, TLS handshake, jitter, uptime, throughput (all with P50/P95/P99)
- **IP security checks**: DNSBL blacklist lookup (4 servers), GeoIP country verification, IP stability tracking
- **5-component scoring**: Uptime (25%), Latency (25%), Jitter (15%), WebSocket (15%), Security (20%) with A-F grading
- **Real-time dashboard**: Live charts, provider comparison radar, JSON/CSV export, error log viewer
- **Continuous testing**: Runs indefinitely until stopped — the longer it runs, the more accurate the results
- **Fully local**: Runs entirely on Docker Compose, no cloud required

## Architecture

```
┌──────────────┐      ┌─────────────────┐      ┌──────────────┐
│  Dashboard   │─────>│ Controller API  │─────>│  Go Runner   │
│  (Next.js)   │      │ (Node.js/TS)    │      │  (long-run   │
│              │      │                 │<─────│   process)   │
│ Enter proxy  │      │ Manage data     │      │  Test proxy  │
│ Start Test   │      │ Trigger runner  │      │  Send results│
│ View results │      │ Serve reports   │      │  to API      │
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

| Service | Language | Port(s) | Role |
|---------|----------|---------|------|
| **Runner** | Go | :9090 | Long-running test engine. 4 goroutines per proxy: HTTP, HTTPS, WS, Summary |
| **API** | Node.js/TypeScript (Express) | :8000 | Controller API. CRUD providers/proxies/runs, trigger Runner, serve results |
| **Target** | Node.js/TypeScript | :3001 (HTTP), :3443 (HTTPS) | Self-hosted target service. Endpoints: /echo, /ip, /large, /slow, /health, /ws-echo |
| **Dashboard** | Next.js 14 + Tailwind CSS | :3000 | UI for managing providers/proxies, starting tests, viewing results/charts |
| **PostgreSQL** | PostgreSQL 16 (Docker) | :5433 (host) → :5432 (container) | 7 tables: provider, proxy_endpoint, test_run, http_sample, ws_sample, run_summary, ip_check_result |

## Tech Stack

- **Runner**: Go, `log/slog`, `github.com/gorilla/websocket`
- **API**: Node.js, TypeScript, Express, `pg`, `pino`, `pino-http`
- **Target**: Node.js, TypeScript, Express, `pino`, self-signed TLS
- **Dashboard**: Next.js 14, React, Tailwind CSS, `recharts`
- **Database**: PostgreSQL with `uuid-ossp` extension

## Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose
- (Optional) Node.js 20+ and Go 1.22+ for local development

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd proxy-stability-test

# 2. Create environment file
cp .env.example .env

# 3. Generate encryption key for proxy passwords
openssl rand -hex 32
# Add the output to .env as ENCRYPTION_KEY=<generated-key>

# 4. Start all services
docker compose up -d

# 5. Open the dashboard
# http://localhost:3000
```

## Usage

### Step 1 — Add Provider
Open the Dashboard, go to **Providers**, and add a proxy provider (e.g., "BrightData").

### Step 2 — Add Proxies
For each provider, add proxy endpoints with host, port, username, password, and expected country. Passwords are encrypted with AES-256-GCM before storage.

### Step 3 — Start Test
Select proxies to test (1 to 10), optionally adjust RPM (default 1000), timeout, and warmup settings, then click **Start Test**.

### Step 4 — Monitor Results
The test runs continuously. The Dashboard auto-updates every 3-5 seconds with:
- Score gauge (0.0 - 1.0, grade A-F)
- Latency chart (P50/P95/P99 over time)
- Uptime timeline (success/error stacked area)
- WebSocket metrics (RTT, drop rate, hold duration)
- IP check results (blacklist, geo verification, stability)

### Step 5 — Stop & Export
Click **Stop Test** when you have enough data. Export results as JSON or CSV. Compare providers on the **Compare** page with a radar chart.

## What Gets Tested

### Connectivity
| Test | Measures |
|------|----------|
| TCP connect | Is the proxy alive? How long to connect? |
| Authentication | Are credentials valid? |
| CONNECT tunnel | Does the proxy support HTTPS tunneling? |

### Performance
| Metric | Description | Good Threshold |
|--------|-------------|----------------|
| TTFB | Time to First Byte | P95 < 200ms |
| TCP connect | TCP connection to proxy | < 50ms (same region) |
| TLS handshake | TLS negotiation through tunnel | < 100ms |
| Jitter (stddev) | Latency variance | Lower = more stable |
| Throughput | Actual bandwidth through proxy | Depends on payload |

### Stability
| Test | Measures |
|------|----------|
| Uptime ratio | % of successful requests (target: >= 99.9%) |
| Error rate | % of failures by error type |
| IP stability | Does the IP change mid-session? |
| WS hold duration | How long WebSocket stays alive before drop |
| Concurrency burst | 100 simultaneous requests — any throttling? |

### Security
| Test | Measures |
|------|----------|
| IP Blacklist (DNSBL) | Checked against Spamhaus, Barracuda, etc. |
| Geo verification | Actual country vs expected country |
| TLS version | TLS 1.2 or 1.3 (< 1.2 is insecure) |
| TLS cipher | Strong vs weak encryption |
| IP stability | IP changes mid-session = suspicious |

### WebSocket
| Test | Measures |
|------|----------|
| WS Handshake | Time to upgrade to WebSocket |
| Message RTT | Round-trip time per message through proxy |
| Drop rate | % of messages lost |
| Keep-alive | How long the proxy holds a WS connection |

## Scoring

Each proxy receives a single score (0.0 - 1.0) based on 5 weighted components:

```
score = 0.25 x Uptime
      + 0.25 x Latency
      + 0.15 x Jitter
      + 0.15 x WebSocket
      + 0.20 x Security
```

| Grade | Score |
|-------|-------|
| A | >= 0.90 |
| B | >= 0.75 |
| C | >= 0.60 |
| D | >= 0.40 |
| F | < 0.40 |

When test phases are skipped, weights are automatically redistributed among remaining components.

## Run Status Flow

```
pending -> running -> stopping -> completed | failed | cancelled
```

- **Stop Test**: Graceful shutdown — finishes in-flight requests, computes final summary
- **Close browser**: Test continues running; reopen browser to see results
- **Docker down**: Runner receives SIGTERM, performs graceful shutdown

## Project Structure

```
proxy-stability-test/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md                           # AI-assisted development context
├── README.md                           # This file
│
├── requirements/                       # Planning documents (10 files)
│   ├── PROXY-TEST-PLAN.md              # Main plan: DB schema, architecture, logging spec
│   ├── PLAN-EXPLANATION.md             # Non-technical explanation
│   ├── sprint-1/
│   │   ├── SPRINT-1-PLAN.md            # 9 tasks: Target, API, Runner, Engine, Reporter, Scorer, E2E
│   │   └── SPRINT-1-EXPLANATION.md
│   ├── sprint-2/
│   │   ├── SPRINT-2-PLAN.md            # 9 tasks: Dashboard setup, CRUD pages, Start/Stop, E2E
│   │   └── SPRINT-2-EXPLANATION.md
│   ├── sprint-3/
│   │   ├── SPRINT-3-PLAN.md            # 9 tasks: WS, IP check, Scheduler, Burst, Scoring, E2E
│   │   └── SPRINT-3-EXPLANATION.md
│   └── sprint-4/
│       ├── SPRINT-4-PLAN.md            # 8 tasks: Charts, Export, Compare, Error viewer, E2E
│       └── SPRINT-4-EXPLANATION.md
│
├── changelog/
│   └── CHANGELOG.md                    # Full version history (v0.1 - v2.1)
│
├── database/                           # 2 files
│   ├── schema.sql                      # Full consolidated schema (7 tables)
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── runner/                             # Go - ~16 files
│   ├── cmd/runner/main.go
│   ├── internal/
│   │   ├── server/handler.go
│   │   ├── config/config.go
│   │   ├── proxy/                      # dialer, http_tester, https_tester, ws_tester, tls_inspector
│   │   ├── ipcheck/                    # blacklist (DNSBL), geoip (ip-api.com)
│   │   ├── engine/                     # orchestrator, scheduler, result_collector
│   │   ├── reporter/                   # api_reporter, db_reporter
│   │   ├── scoring/scorer.go
│   │   └── domain/types.go
│   ├── go.mod / go.sum
│   └── Dockerfile
│
├── api/                                # Node.js/TypeScript - ~15 files
│   ├── src/
│   │   ├── index.ts
│   │   ├── db/pool.ts
│   │   ├── routes/                     # providers, proxies, runs, results, export
│   │   ├── services/                   # runService, scoringService, exportService
│   │   └── middleware/                  # pagination, errorHandler
│   ├── package.json / tsconfig.json
│   └── Dockerfile
│
├── target/                             # Node.js/TypeScript - ~13 files
│   ├── src/
│   │   ├── index.ts                    # HTTP (:3001) + HTTPS (:3443)
│   │   ├── routes/                     # echo, ip, large, slow, health
│   │   └── ws/wsEcho.ts               # WebSocket echo + ping/pong
│   ├── certs/                          # Self-signed TLS
│   ├── package.json / tsconfig.json
│   └── Dockerfile
│
├── dashboard/                          # Next.js 14 - ~75 files
│   ├── src/
│   │   ├── app/                        # Pages: overview, providers, runs, run detail, compare
│   │   ├── lib/                        # logger, api-client
│   │   ├── hooks/                      # 10 custom hooks (polling, CRUD, charts, export)
│   │   ├── components/                 # 54 React components
│   │   └── types/index.ts
│   ├── package.json / tsconfig.json
│   └── Dockerfile
│
└── configs/                            # Sample YAML (advanced CLI mode)
    ├── single-proxy.yaml
    └── multi-proxy.yaml
```

**Total: ~121 files** across all services.

## Development Roadmap

| Sprint | Scope | Key Deliverables |
|--------|-------|-----------------|
| **1** | Foundation | Target (HTTP+HTTPS), API CRUD, Runner HTTP/HTTPS testers, Engine, Reporter, Scorer (3 components), E2E |
| **2** | Dashboard UI | Next.js setup, API client + hooks, Provider/Proxy CRUD, Start/Stop flow, Runs list, Run detail, Overview |
| **3** | WS + Security | WS tester, IP check (DNSBL + GeoIP), Multi-proxy scheduler (max 10), Burst test, Scoring (5 components) |
| **4** | Advanced Dashboard | recharts charts, Export JSON/CSV, Provider comparison (radar chart), Error log viewer |

## Database Schema

7 PostgreSQL tables:

| Table | Purpose |
|-------|---------|
| `provider` | Proxy providers (name, website, notes) |
| `proxy_endpoint` | Proxy connection details (host, port, encrypted credentials) |
| `test_run` | Test run lifecycle (status, config, timing, sample counts) |
| `http_sample` | Individual HTTP/HTTPS request results (timing, status, errors) |
| `ws_sample` | WebSocket connection results (RTT, hold duration, drop count) |
| `ip_check_result` | IP blacklist, geo verification, stability checks |
| `run_summary` | Aggregated metrics + scoring per run |

## Logging

All services use structured JSON logging:

| Service | Library | Key Fields |
|---------|---------|------------|
| Runner | `log/slog` | `module`, `goroutine`, `phase`, `proxy_id`, `run_id` |
| API | `pino` + `pino-http` | `module`, `run_id`, `proxy_id` |
| Target | `pino` | `module`, `server_port`, `protocol` |
| Dashboard | `console.*` | `module` |

View logs:
```bash
# All services
docker compose logs -f

# Filter Runner errors in continuous phase
docker compose logs runner | jq 'select(.phase == "continuous" and .level == "ERROR")'

# Filter by proxy
docker compose logs runner | jq 'select(.proxy_label == "BrightData-VN-1")'
```

## Security

- Proxy passwords are encrypted with **AES-256-GCM** before storage
- Encryption key: 32-byte hex via `ENCRYPTION_KEY` environment variable
- Passwords are **never** returned by the API or logged
- Target service uses self-signed TLS certificates for HTTPS testing

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ENCRYPTION_KEY` | 32-byte hex key for password encryption | `openssl rand -hex 32` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:123@postgres:5432/proxytest` |
| `RUNNER_URL` | Runner service URL | `http://runner:9090` |
| `TARGET_HTTP_URL` | Target HTTP URL | `http://target:3001` |
| `TARGET_HTTPS_URL` | Target HTTPS URL | `https://target:3443` |
| `NEXT_PUBLIC_API_URL` | API URL for Dashboard | `http://localhost:8000/api/v1` |

## Documentation

| Topic | File |
|-------|------|
| Full implementation plan (DB schema, architecture, logging) | `requirements/PROXY-TEST-PLAN.md` |
| Non-technical overview | `requirements/PLAN-EXPLANATION.md` |
| Sprint N tasks & acceptance criteria | `requirements/sprint-N/SPRINT-N-PLAN.md` |
| Sprint N explanation | `requirements/sprint-N/SPRINT-N-EXPLANATION.md` |
| Version history | `changelog/CHANGELOG.md` |
| Project status & changes | `changelog/STATUS.md` |
| AI development context | `CLAUDE.md` |

## License

Private project. All rights reserved.
