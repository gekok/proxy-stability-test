# Sprint 1 — Foundation (Chi tiết)

> **Mục tiêu Sprint 1**: Xây nền tảng hoàn chỉnh — từ `docker compose up -d` đến Runner test được 1 proxy (HTTP + HTTPS riêng biệt, đủ 6 methods), kết quả vào PostgreSQL.

| Field | Value |
|-------|-------|
| Sprint | 1 / 4 |
| Thời gian | Week 1-2 |
| Input | Không có code, bắt đầu từ zero |
| Output | 4 services chạy local, Runner test 1 proxy qua API trigger |

---

## Tổng quan Tasks (theo thứ tự dependency)

```
Task 1: Project Setup + Docker Compose + Database
  ↓
Task 2: Target Service (HTTP :3001 + HTTPS :3443)     ← không phụ thuộc Task 3-8
  ↓
Task 3: Controller API (CRUD + batch ingestion)        ← phụ thuộc Task 1 (DB)
  ↓
Task 4: Go Runner — Foundation (server, config, dialer)
  ↓
Task 5: Go Runner — HTTP Tester (plain HTTP, 6 methods)
Task 6: Go Runner — HTTPS Tester (CONNECT tunnel, 6 methods)   ← Task 5, 6 song song
  ↓
Task 7: Go Runner — Engine (orchestrator, scheduler, result_collector)
  ↓
Task 8: Go Runner — Reporter + Scorer
  ↓
Task 9: Integration Test (end-to-end)
```

> Task 2 và Task 3 có thể làm song song vì không phụ thuộc nhau.
> Task 5 và Task 6 có thể làm song song vì cùng interface.

---

## Task 1: Project Setup + Docker Compose + Database

### Mục tiêu
Tạo cấu trúc project, Docker Compose chạy được, database schema sẵn sàng.

### Files cần tạo

```
proxy-stability-test/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── .gitignore
└── database/
    ├── schema.sql              ← full 7 tables
    └── migrations/
        └── 001_initial_schema.sql
```

### 1.1 Docker Compose

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
      - "3001:3001"
      - "3443:3443"

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
      - "9090:9090"
    environment:
      - DATABASE_URL=postgres://proxytest:proxytest@postgres:5432/proxytest
      - API_URL=http://api:8000/api/v1
      - RUNNER_PORT=9090
    depends_on: [postgres, target, api]

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

> **Sprint 1**: Dashboard chỉ cần placeholder (Next.js default page). Chức năng thật ở Sprint 2.

### 1.2 Database Schema

7 tables — copy nguyên từ plan tổng:

| # | Table | Mô tả | Sprint 1 sử dụng? |
|---|-------|-------|-------------------|
| 1 | `provider` | Nhà cung cấp proxy | **Có** — CRUD qua API |
| 2 | `proxy_endpoint` | Thông tin proxy (host/port/auth) | **Có** — CRUD qua API |
| 3 | `test_run` | 1 lần test 1 proxy | **Có** — tạo khi trigger Runner |
| 4 | `http_sample` | Kết quả mỗi HTTP/HTTPS request | **Có** — Runner ghi kết quả |
| 5 | `ws_sample` | Kết quả mỗi WS connection | Tạo table nhưng chưa ghi data (WS ở Sprint 3) |
| 6 | `ip_check_result` | Kết quả IP check | Tạo table nhưng chưa ghi data (IP check ở Sprint 3) |
| 7 | `run_summary` | Tổng hợp score | **Có** — Runner tính summary |

**Lưu ý quan trọng trong schema**:
- `http_sample.method` — lưu method (GET/POST/PUT/PATCH/DELETE/HEAD)
- `http_sample.is_https` — phân biệt HTTP goroutine (false) vs HTTPS goroutine (true)
- `test_run.http_rpm` + `test_run.https_rpm` — RPM riêng cho mỗi goroutine
- `test_run.total_http_samples` + `test_run.total_https_samples` — đếm riêng
- `run_summary.https_sample_count` — đếm HTTPS samples riêng

### 1.3 .env.example

```env
# Database
DATABASE_URL=postgres://proxytest:proxytest@postgres:5432/proxytest

# Runner
API_URL=http://api:8000/api/v1
RUNNER_PORT=9090

# Encryption key cho proxy password (AES-256-GCM)
ENCRYPTION_KEY=change-me-to-a-32-byte-hex-string

# Log level
LOG_LEVEL=info
```

### 1.4 CLAUDE.md

File hướng dẫn cho AI assistant, chứa:
- Tech stack overview
- Cách chạy project (`docker compose up -d`)
- Cấu trúc folder
- Convention: structured JSON logging, UUID primary keys, cursor pagination

### Acceptance Criteria — Task 1
- [ ] `docker compose up -d` → postgres, target, api, runner, dashboard start không lỗi
- [ ] `psql` connect được, 7 tables tồn tại
- [ ] Schema có đúng các cột mới: `is_https`, `http_rpm`, `https_rpm`, `total_https_samples`, `https_sample_count`

---

## Task 2: Target Service

### Mục tiêu
Self-hosted HTTP/HTTPS server mà Runner sẽ gọi tới qua proxy. Listen trên 2 ports.

### Files cần tạo

```
target/
├── src/
│   ├── index.ts              ← Start HTTP (:3001) + HTTPS (:3443)
│   ├── routes/
│   │   ├── echo.ts           ← ALL methods: GET/POST/PUT/PATCH/DELETE/HEAD
│   │   ├── ip.ts             ← GET/HEAD /ip
│   │   ├── large.ts          ← GET /large?size=N
│   │   ├── slow.ts           ← GET /slow?delay=N
│   │   └── health.ts         ← GET /health
│   └── ws/
│       └── wsEcho.ts         ← WS echo (placeholder, Sprint 3 hoàn thiện)
├── certs/
│   ├── generate-cert.sh      ← Script tạo self-signed cert
│   ├── server.key
│   └── server.crt
├── package.json
├── tsconfig.json
└── Dockerfile
```

### 2.1 Endpoints chi tiết

#### `GET /health`
```json
Response: { "status": "ok", "uptime_ms": 12345 }
```

#### `/echo` — ALL METHODS (endpoint chính cho method testing)

Chấp nhận: **GET, POST, PUT, PATCH, DELETE, HEAD**

```
Request headers (Runner gửi):
  User-Agent: ProxyTester/1.0
  X-Run-Id: <uuid>
  X-Seq: <number>
  Content-Type: application/json  (cho POST/PUT/PATCH)

Response (cho mọi method trừ HEAD):
{
  "method": "POST",              ← method nhận được
  "body": {"test": true},        ← echo body (null cho GET/DELETE)
  "headers": {                   ← headers nhận được
    "user-agent": "ProxyTester/1.0",
    "x-run-id": "abc-123",
    "x-seq": "42"
  },
  "content_length": 45,
  "timestamp": "2026-02-24T10:30:15.123Z"
}

Response cho HEAD:
  → Chỉ trả headers (Content-Length, Content-Type)
  → Không body

Response cho GET:
  → body = null, content_length = 0

Response cho DELETE:
  → body = null
```

#### `GET /ip` + `HEAD /ip`
```json
Response: {
  "ip": "<client IP từ request>",
  "headers": {
    "x-forwarded-for": "...",
    "x-real-ip": "..."
  },
  "timestamp": "2026-02-24T10:30:15.123Z"
}
```
Lấy IP từ: `req.socket.remoteAddress` hoặc `x-forwarded-for` header.

#### `GET /large?size=N`
- Trả `N` bytes random data (default N=1024, max 10MB)
- Content-Type: `application/octet-stream`
- Dùng để đo bandwidth

#### `GET /slow?delay=N`
- Chờ `N` milliseconds rồi trả response (default N=1000, max 30000)
- Response: `{ "delayed_ms": N, "timestamp": "..." }`
- Dùng để đo timeout handling

#### `WS /ws-echo` (placeholder Sprint 1)
- Sprint 1: chỉ tạo file, accept connection, echo 1 message
- Sprint 3: hoàn thiện keep-alive, ping/pong, hold duration

### 2.2 HTTPS Server

```typescript
// index.ts
import https from 'https';
import fs from 'fs';

// HTTP server (:3001)
app.listen(3001);

// HTTPS server (:3443) — self-signed cert
const httpsServer = https.createServer({
  key: fs.readFileSync('./certs/server.key'),
  cert: fs.readFileSync('./certs/server.crt'),
}, app);
httpsServer.listen(3443);
```

Self-signed cert tạo bằng:
```bash
openssl req -x509 -newkey rsa:2048 -keyout server.key -out server.crt \
  -days 3650 -nodes -subj '/CN=target'
```

> **Dockerfile/entrypoint**: Run this command in the Target service Dockerfile (build stage) or entrypoint script to auto-generate `certs/server.key` + `certs/server.crt` if they don't exist. This ensures the HTTPS server (:3443) always has valid certs on first boot.

### 2.3 Logging (Target Service)

Dùng `pino` — structured JSON. Base fields: `{ service: "target" }`.

> **Quan trọng**: Mỗi log entry PHẢI có `server_port` (3001/3443) và `protocol` (http/https) để phân biệt request đi vào port nào.

| Event | Level | Fields |
|-------|-------|--------|
| HTTP server started | INFO | `protocol: "http"`, `port: 3001` |
| HTTPS server started | INFO | `protocol: "https"`, `port: 3443`, `cert_path`, `key_path` |
| TLS cert loaded | INFO | `cert_subject`, `cert_expiry` |
| All routes mounted | INFO | `routes: ["/health", "/echo", "/ip", "/large", "/slow", "/ws-echo"]` |
| Request received | DEBUG | `method`, `path`, `client_ip`, `headers.x-forwarded-for`, `server_port`, `protocol` |
| Response sent | DEBUG | `path`, `status_code`, `response_size`, `duration_ms`, `server_port`, `protocol` |
| Echo request received | DEBUG | `method`, `body_size`, `headers_count`, `server_port`, `protocol` |
| Large payload generated | INFO | `size_bytes`, `duration_ms`, `server_port`, `protocol` |
| Slow endpoint delay | DEBUG | `delay_ms`, `server_port`, `protocol` |
| WS connection opened | INFO | `client_ip` |
| WS connection closed | INFO | `client_ip`, `duration_ms`, `messages_count` |

### 2.4 Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3001 3443
CMD ["node", "dist/index.js"]
```

### Acceptance Criteria — Task 2
- [ ] `curl http://localhost:3001/health` → `{"status":"ok"}`
- [ ] `curl http://localhost:3001/echo` → GET echo response
- [ ] `curl -X POST http://localhost:3001/echo -H 'Content-Type: application/json' -d '{"test":true}'` → echo body
- [ ] `curl -X PUT http://localhost:3001/echo -d '{"update":true}'` → echo PUT
- [ ] `curl -X PATCH http://localhost:3001/echo -d '{"patch":"x"}'` → echo PATCH
- [ ] `curl -X DELETE http://localhost:3001/echo` → delete response
- [ ] `curl -I http://localhost:3001/echo` → HEAD (headers only)
- [ ] `curl http://localhost:3001/ip` → trả IP
- [ ] `curl http://localhost:3001/large?size=1024` → 1024 bytes
- [ ] `curl http://localhost:3001/slow?delay=500` → chờ 500ms rồi trả
- [ ] `curl -k https://localhost:3443/echo` → HTTPS hoạt động
- [ ] `curl -k https://localhost:3443/ip` → IP qua HTTPS

---

## Task 3: Controller API

### Mục tiêu
REST API quản lý data + nhận kết quả từ Runner. Đây là cầu nối giữa Dashboard ↔ Runner.

### Files cần tạo

```
api/
├── src/
│   ├── index.ts              ← Express app setup + start server :8000
│   ├── db/
│   │   └── pool.ts           ← pg Pool setup từ DATABASE_URL
│   ├── routes/
│   │   ├── providers.ts      ← CRUD providers
│   │   ├── proxies.ts        ← CRUD proxies
│   │   ├── runs.ts           ← CRUD runs + trigger Runner + stop
│   │   ├── results.ts        ← GET samples, summaries, IP checks
│   │   └── export.ts         ← GET /runs/:id/export (placeholder)
│   ├── services/
│   │   ├── runService.ts     ← Business logic: create run, trigger runner, stop
│   │   └── scoringService.ts ← Placeholder (Runner tính score, API chỉ lưu)
│   ├── middleware/
│   │   ├── pagination.ts     ← Cursor-based pagination helper
│   │   └── errorHandler.ts   ← Global error handler
│   └── types/
│       └── index.ts          ← TypeScript interfaces
├── package.json
├── tsconfig.json
└── Dockerfile
```

### 3.1 Endpoints chi tiết

#### Providers — CRUD cơ bản

```
POST   /api/v1/providers
  Body: { name, website?, notes? }
  Response: 201 { data: provider }
  Validate: name required + unique

GET    /api/v1/providers
  Query: ?limit=20&cursor=xxx
  Response: { data: [...], pagination: { has_more, next_cursor, total_count } }

GET    /api/v1/providers/:id
  Response: { data: provider }

PUT    /api/v1/providers/:id
  Body: { name?, website?, notes? }
  Response: { data: provider }

DELETE /api/v1/providers/:id
  Response: 204 (cascade delete proxies + runs)
```

#### Proxies — CRUD + password handling

```
POST   /api/v1/proxies
  Body: {
    provider_id,      ← UUID, required
    label,            ← required
    host,             ← required
    port,             ← required, 1-65535
    protocol,         ← "http" | "https" | "socks5", default "http"
    auth_user?,
    auth_pass?,       ← plaintext → API encrypts → lưu auth_pass_enc
    expected_country?,
    expected_city?,
    is_dedicated?     ← default false
  }
  Response: 201 { data: proxy }   (KHÔNG trả auth_pass_enc)
  Logic: encrypt auth_pass bằng AES-256-GCM → lưu auth_pass_enc

GET    /api/v1/proxies
  Query: ?provider_id=xxx&limit=20&cursor=xxx
  Response: { data: [...] }   (KHÔNG trả auth_pass_enc)

GET    /api/v1/proxies/:id
  Response: { data: proxy }   (KHÔNG trả auth_pass_enc)

PUT    /api/v1/proxies/:id
  Body: { label?, host?, port?, auth_pass?, ... }
  Logic: nếu có auth_pass mới → re-encrypt

DELETE /api/v1/proxies/:id
  Response: 204
```

**Password encryption**:
```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(encryptedStr: string): string {
  const [ivB64, tagB64, dataB64] = encryptedStr.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
```

#### Test Runs — tạo run + trigger Runner

```
POST   /api/v1/runs
  Body: {
    proxy_id,              ← UUID, required
    run_mode?,             ← "continuous" (default) | "fixed"
    http_rpm?,             ← default 500
    https_rpm?,            ← default 500
    ws_messages_per_minute?, ← default 60
    request_timeout_ms?,   ← default 10000
    warmup_requests?       ← default 5
  }
  Logic:
    1. Tạo test_run record (status = "pending")
    2. Snapshot config vào config_snapshot JSONB
    3. Trả về run object
  Response: 201 { data: run }

POST   /api/v1/runs/start
  Body: { run_ids: ["uuid1", "uuid2", ...] }
  Logic:
    1. Validate tất cả run_ids tồn tại + status = "pending"
    2. Update status → "running", started_at = now()
    3. Lấy proxy info (decrypt password) cho mỗi run
    4. Gọi Runner: POST http://runner:9090/trigger
       Body: { runs: [{ run_id, proxy: { host, port, user, pass, ... }, config: {...} }] }
    5. Nếu Runner trả OK → done
    6. Nếu Runner fail → update status = "failed", error_message
  Response: { data: { triggered: N, failed: 0 } }

POST   /api/v1/runs/:id/stop
  Logic:
    1. Update status → "stopping"
    2. Gọi Runner: POST http://runner:9090/stop  Body: { run_id }
  Response: { data: { status: "stopping" } }

GET    /api/v1/runs
  Query: ?proxy_id=xxx&status=running&limit=20
  Response: { data: [...], pagination }

GET    /api/v1/runs/:id
  Response: { data: run }  (include latest summary nếu có)

PATCH  /api/v1/runs/:id/status
  Body: { status, total_http_samples?, total_https_samples?, total_ws_samples?, error_message? }
  (Runner dùng endpoint này để update status)

DELETE /api/v1/runs/:id
  Response: 204 (cascade delete samples + summary)
```

#### Runner Ingestion — Runner gửi data về

```
POST   /api/v1/runs/:id/http-samples/batch
  Body: { samples: [ { seq, is_warmup, target_url, method, is_https, status_code,
                        error_type?, tcp_connect_ms, tls_handshake_ms?, ttfb_ms,
                        total_ms, tls_version?, tls_cipher?, bytes_sent, bytes_received } ] }
  Validate: max 100 samples/call
  Logic: batch INSERT vào http_sample table
  Response: 201 { inserted: N }

POST   /api/v1/runs/:id/ws-samples/batch
  (Sprint 1: endpoint tồn tại nhưng chưa cần dùng)

POST   /api/v1/runs/:id/ip-checks
  (Sprint 1: endpoint tồn tại nhưng chưa cần dùng)

POST   /api/v1/runs/:id/summary
  Body: run_summary object
  Logic: UPSERT (insert or update) vào run_summary
  Response: 200 { data: summary }
```

#### Samples & Results — đọc kết quả

```
GET    /api/v1/runs/:id/http-samples
  Query: ?is_warmup=false&is_https=true&method=POST&limit=50&cursor=xxx
  Response: { data: [...], pagination }

GET    /api/v1/runs/:id/summary
  Response: { data: run_summary }
```

### 3.2 Cursor-based Pagination

```typescript
// middleware/pagination.ts
// Cursor = base64(measured_at + id) — stable sort
// Default limit = 20, max = 100
// Response shape: { data, pagination: { has_more, next_cursor, total_count } }
```

### 3.3 Logging (Controller API)

Dùng `pino` + `pino-http`. Base fields: `{ service: "api" }`. Mỗi request auto-generate `request_id` (UUID).

> **Xem bảng log points đầy đủ**: `PROXY-TEST-PLAN.md` → Section 9.3 → Controller API.

| Event | Level | Fields |
|-------|-------|--------|
| **Request layer (pino-http auto)** | | |
| Request received | INFO | `method`, `path`, `query_params`, `request_id` |
| Response sent | INFO | `method`, `path`, `status_code`, `duration_ms`, `request_id` |
| Validation error | WARN | `path`, `validation_errors[]`, `body_received` (masked), `request_id` |
| Not found | WARN | `path`, `resource_type`, `resource_id`, `request_id` |
| **Services layer** | | |
| Run created | INFO | `run_id`, `proxy_id`, `run_mode`, `config_summary` |
| Run triggered → Runner | INFO | `run_id`, `proxy_count`, `runner_url` |
| Runner trigger fail | ERROR | `run_id`, `runner_url`, `error_detail` |
| Run status changed | INFO | `run_id`, `old_status`, `new_status` |
| Stop requested | INFO | `run_id`, `proxy_label`, `requested_by: "user"` |
| Stop forwarded → Runner | INFO | `run_id`, `runner_url` |
| Summary received | INFO | `run_id`, `score_total`, `total_samples` |
| Batch ingestion | INFO | `run_id`, `table`, `count` |
| Batch validation fail | ERROR | `run_id`, `invalid_count`, `first_error` |
| Password encrypted | DEBUG | `proxy_id` (KHÔNG log password) |
| Password encrypt fail | ERROR | `proxy_id`, `error_detail` |
| **Database layer** | | |
| Pool connected | INFO | `host`, `database`, `pool_size` |
| Pool connection fail | FATAL | `host`, `error_detail` |
| DB query slow | WARN | `query_name`, `duration_ms` (> 1000ms) |
| Query error | ERROR | `query_name`, `error_detail`, `params` (masked) |
| **Error handler** | | |
| Unhandled error | ERROR | `error_message`, `stack_trace`, `request_id`, `path` |
| 500 returned | ERROR | `request_id`, `path`, `error_type` |

### 3.4 Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 8000
CMD ["node", "dist/index.js"]
```

### Acceptance Criteria — Task 3
- [ ] CRUD providers: create, list, get, update, delete hoạt động
- [ ] CRUD proxies: create (password encrypted), list (password hidden), delete
- [ ] Create run → status = "pending"
- [ ] Start run → gọi Runner → status = "running" (hoặc fail gracefully)
- [ ] Stop run → status = "stopping"
- [ ] Batch insert http_samples → data vào DB
- [ ] Upsert summary → data vào DB
- [ ] Pagination hoạt động (limit, cursor, total_count)
- [ ] Error handler trả JSON error response

---

## Task 4: Go Runner — Foundation

### Mục tiêu
Khung Runner: HTTP server chờ lệnh, config parser, TCP dialer.

### Files cần tạo

```
runner/
├── cmd/runner/
│   └── main.go                 ← Entry point: start HTTP server
├── internal/
│   ├── server/
│   │   └── handler.go          ← POST /trigger, POST /stop, GET /health
│   ├── config/
│   │   └── config.go           ← Parse config từ trigger payload
│   ├── proxy/
│   │   └── dialer.go           ← TCP connect + auth qua proxy
│   └── domain/
│       └── types.go            ← Shared structs
├── go.mod
├── go.sum
└── Dockerfile
```

### 4.1 Runner HTTP Server (handler.go)

Runner listen trên `:9090` (env RUNNER_PORT):

```
POST /trigger
  Body: {
    runs: [{
      run_id: "uuid",
      proxy: { host, port, protocol, auth_user, auth_pass, expected_country },
      config: { http_rpm, https_rpm, ws_messages_per_minute, request_timeout_ms, warmup_requests, summary_interval_sec }
    }]
  }
  Logic:
    1. Validate payload
    2. Cho mỗi run → khởi tạo orchestrator
    3. Trả 202 Accepted ngay (không chờ test xong)
  Response: 202 { accepted: N }

POST /stop
  Body: { run_id: "uuid" }
  Logic:
    1. Tìm orchestrator đang chạy cho run_id
    2. Gửi stop signal (context cancel)
  Response: 200 { status: "stopping" }

GET /health
  Response: { status: "ok", active_runs: N }
```

### 4.2 Config (config.go)

```go
type RunConfig struct {
    RunID              string
    Proxy              ProxyConfig
    HTTPRPM            int           // default 500
    HTTPSRPM           int           // default 500
    WSMessagesPerMin   int           // default 60
    RequestTimeoutMS   int           // default 10000
    WarmupRequests     int           // default 5
    SummaryIntervalSec int           // default 30
    ConcurrencyCount   int           // default 100
    BurstIntervalSec   int           // default 300
}

type ProxyConfig struct {
    Host            string
    Port            int
    Protocol        string  // "http"
    AuthUser        string
    AuthPass        string  // plaintext (đã decrypt bởi API)
    ExpectedCountry string
}
```

### 4.3 Dialer (dialer.go)

```go
// DialThroughProxy creates a TCP connection through the proxy
func DialThroughProxy(ctx context.Context, proxy ProxyConfig) (net.Conn, time.Duration, error) {
    start := time.Now()

    // 1. TCP connect tới proxy
    conn, err := net.DialTimeout("tcp",
        fmt.Sprintf("%s:%d", proxy.Host, proxy.Port),
        time.Duration(cfg.RequestTimeoutMS)*time.Millisecond)

    connectMS := time.Since(start)

    if err != nil {
        return nil, connectMS, fmt.Errorf("tcp_connect_failed: %w", err)
    }

    return conn, connectMS, nil
}

// ConnectTunnel sends CONNECT request for HTTPS/WSS
func ConnectTunnel(conn net.Conn, targetHost string, targetPort int, proxy ProxyConfig) error {
    // Send: CONNECT target:port HTTP/1.1
    // With Proxy-Authorization if auth_user set
    // Wait for: HTTP/1.1 200 Connection Established
}
```

### 4.4 Shared Types (types.go)

```go
type HTTPSample struct {
    Seq            int       `json:"seq"`
    IsWarmup       bool      `json:"is_warmup"`
    TargetURL      string    `json:"target_url"`
    Method         string    `json:"method"`         // GET/POST/PUT/PATCH/DELETE/HEAD
    IsHTTPS        bool      `json:"is_https"`
    StatusCode     int       `json:"status_code"`
    ErrorType      string    `json:"error_type,omitempty"`
    ErrorMessage   string    `json:"error_message,omitempty"`
    TCPConnectMS   float64   `json:"tcp_connect_ms"`
    TLSHandshakeMS float64   `json:"tls_handshake_ms,omitempty"`  // chỉ HTTPS
    TTFBMS         float64   `json:"ttfb_ms"`
    TotalMS        float64   `json:"total_ms"`
    TLSVersion     string    `json:"tls_version,omitempty"`
    TLSCipher      string    `json:"tls_cipher,omitempty"`
    BytesSent      int64     `json:"bytes_sent"`
    BytesReceived  int64     `json:"bytes_received"`
    MeasuredAt     time.Time `json:"measured_at"`
}
```

### 4.5 Dockerfile

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /runner ./cmd/runner

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /runner /runner
EXPOSE 9090
CMD ["/runner"]
```

### Acceptance Criteria — Task 4
- [ ] Runner start → listen :9090
- [ ] `GET /health` → `{"status":"ok"}`
- [ ] `POST /trigger` → 202 Accepted (chưa cần chạy test thật)
- [ ] `POST /stop` → 200 (chưa cần dừng thật)
- [ ] Dialer: TCP connect tới proxy hoạt động
- [ ] CONNECT tunnel hoạt động

---

## Task 5: Go Runner — HTTP Tester (plain HTTP)

### Mục tiêu
Goroutine 1: test plain HTTP qua proxy, xoay vòng 6 methods, 500 RPM.

### File: `runner/internal/proxy/http_tester.go`

### 5.1 Interface

```go
type HTTPTester struct {
    proxy      ProxyConfig
    runID      string
    rpm        int               // 500
    timeout    time.Duration
    limiter    *rate.Limiter     // token bucket
    targets    []TargetEndpoint
    samples    chan<- HTTPSample  // gửi sample về collector
    logger     *slog.Logger
}

func (t *HTTPTester) Run(ctx context.Context) error {
    // Loop cho đến khi ctx cancelled (stop signal)
    // Xoay vòng methods
    // Gửi sample qua channel sau mỗi request
}
```

### 5.2 Method Rotation Logic

```go
var methods = []struct {
    Method string
    Path   string
    Body   func(seq int) []byte
}{
    {"GET",    "/echo",  nil},
    {"POST",   "/echo",  func(seq int) []byte { return []byte(fmt.Sprintf(`{"test":true,"seq":%d}`, seq)) }},
    {"PUT",    "/echo",  func(seq int) []byte { return []byte(fmt.Sprintf(`{"update":true,"seq":%d}`, seq)) }},
    {"PATCH",  "/echo",  func(seq int) []byte { return []byte(fmt.Sprintf(`{"patch":"field_x","seq":%d}`, seq)) }},
    {"DELETE", "/echo",  nil},
    {"HEAD",   "/echo",  nil},
}

// Mỗi 10 batches xen kẽ thêm:
//   GET /large?size=1048576
//   GET /slow?delay=2000
// Mỗi 30 giây:
//   GET /ip  (IP stability check)
```

### 5.3 httptrace cho plain HTTP

```go
func (t *HTTPTester) doRequest(ctx context.Context, method, targetURL string, body []byte, seq int) HTTPSample {
    sample := HTTPSample{
        Seq:       seq,
        TargetURL: targetURL,
        Method:    method,
        IsHTTPS:   false,    // ← plain HTTP
    }

    var connectStart, connectDone, gotFirstByte time.Time

    trace := &httptrace.ClientTrace{
        ConnectStart: func(_, _ string) { connectStart = time.Now() },
        ConnectDone:  func(_, _ string, _ error) { connectDone = time.Now() },
        GotFirstResponseByte: func() { gotFirstByte = time.Now() },
        // KHÔNG có TLSHandshakeStart/Done vì plain HTTP
    }

    reqStart := time.Now()
    req, _ := http.NewRequestWithContext(httptrace.WithClientTrace(ctx, trace), method, targetURL, bytes.NewReader(body))
    req.Header.Set("User-Agent", "ProxyTester/1.0")
    req.Header.Set("X-Run-Id", t.runID)
    req.Header.Set("X-Seq", strconv.Itoa(seq))

    // Use proxy transport
    resp, err := t.client.Do(req)

    sample.TotalMS = float64(time.Since(reqStart).Milliseconds())
    sample.TCPConnectMS = float64(connectDone.Sub(connectStart).Milliseconds())
    sample.TTFBMS = float64(gotFirstByte.Sub(reqStart).Milliseconds())

    if err != nil {
        sample.ErrorType = classifyError(err) // Xem bảng 17 error types ở plan tổng Section 10
        sample.ErrorMessage = err.Error()
    } else {
        sample.StatusCode = resp.StatusCode
        sample.BytesReceived = resp.ContentLength
    }

    return sample
}
```

### 5.4 Rate Limiting (Token Bucket)

```go
// 500 RPM = ~8.33 requests/sec
limiter := rate.NewLimiter(rate.Limit(float64(rpm)/60.0), 1)

// Trước mỗi request:
if err := limiter.Wait(ctx); err != nil {
    break // context cancelled = stop signal
}
```

### 5.5 Concurrency Burst (mỗi 5 phút)

```go
// Mỗi 300 giây, tạo 100 goroutines gửi GET /echo đồng thời
// Đo: bao nhiêu success / fail
// Record kết quả burst vào log (không ghi vào http_sample)
```

### Acceptance Criteria — Task 5
- [ ] HTTP tester gửi requests qua proxy tới target
- [ ] Xoay vòng đủ 6 methods: GET, POST, PUT, PATCH, DELETE, HEAD
- [ ] httptrace đo đúng: tcp_connect_ms, ttfb_ms, total_ms
- [ ] Rate limiter giới hạn đúng 500 RPM
- [ ] `is_https = false` trên tất cả samples
- [ ] `method` field ghi đúng method đã gửi
- [ ] Error classification hoạt động (timeout, connection_refused, etc.)
- [ ] Dừng khi nhận stop signal (context cancel)

---

## Task 6: Go Runner — HTTPS Tester (CONNECT tunnel)

### Mục tiêu
Goroutine 2: test HTTPS qua CONNECT tunnel + TLS, xoay vòng 6 methods, 500 RPM.

### File: `runner/internal/proxy/https_tester.go`

### 6.1 Interface (giống HTTP tester nhưng thêm CONNECT + TLS)

```go
type HTTPSTester struct {
    proxy      ProxyConfig
    runID      string
    rpm        int               // 500
    timeout    time.Duration
    limiter    *rate.Limiter
    targets    []TargetEndpoint  // https://target:3443/...
    samples    chan<- HTTPSample
    logger     *slog.Logger
}

func (t *HTTPSTester) Run(ctx context.Context) error {
    // Loop cho đến khi ctx cancelled
    // Mỗi request: CONNECT → TLS → HTTPS request
    // Xoay vòng 6 methods (giống HTTP tester)
}
```

### 6.2 Flow cho mỗi request (3 giai đoạn)

```go
func (t *HTTPSTester) doRequest(ctx context.Context, method, targetURL string, body []byte, seq int) HTTPSample {
    sample := HTTPSample{
        Seq:       seq,
        TargetURL: targetURL,
        Method:    method,
        IsHTTPS:   true,     // ← HTTPS
    }

    // === Giai đoạn 1: CONNECT tunnel ===
    conn, connectMS, err := DialThroughProxy(ctx, t.proxy)
    if err != nil {
        sample.ErrorType = "connection_refused"
        return sample
    }
    sample.TCPConnectMS = float64(connectMS.Milliseconds())

    err = ConnectTunnel(conn, targetHost, 3443, t.proxy)
    if err != nil {
        sample.ErrorType = classifyConnectError(err) // connect_tunnel_failed, proxy_auth_failed, etc.
        return sample
    }

    // === Giai đoạn 2: TLS handshake trong tunnel ===
    tlsStart := time.Now()
    tlsConn := tls.Client(conn, &tls.Config{
        ServerName:         targetHost,
        InsecureSkipVerify: true, // self-signed cert
    })
    err = tlsConn.HandshakeContext(ctx)
    sample.TLSHandshakeMS = float64(time.Since(tlsStart).Milliseconds())

    if err != nil {
        sample.ErrorType = classifyTLSError(err) // tls_handshake_failed, tls_cert_expired, etc.
        return sample
    }

    state := tlsConn.ConnectionState()
    sample.TLSVersion = tlsVersionString(state.Version)   // "TLS 1.3"
    sample.TLSCipher = tls.CipherSuiteName(state.CipherSuite)

    // === Giai đoạn 3: HTTPS request trong tunnel ===
    // Tạo HTTP client trên tlsConn
    // httptrace: GotFirstResponseByte
    // Gửi request, đo ttfb, total

    return sample
}
```

### 6.3 Method Rotation

Giống hệt Task 5 (cùng 6 methods), nhưng:
- Target URL: `https://target:3443/echo` (thay vì `http://target:3001/echo`)
- Mỗi request thêm CONNECT + TLS overhead
- `is_https = true`
- `tls_handshake_ms > 0`
- `tls_version` + `tls_cipher` có giá trị

### 6.4 Error Classification cho HTTPS

```go
func classifyConnectError(err error, statusCode int) string {
    switch {
    case statusCode == 407: return "proxy_auth_failed"
    case statusCode == 403: return "proxy_rejected"
    case statusCode >= 500: return "proxy_error"
    case statusCode != 200: return "connect_tunnel_failed"
    default:                return "connect_tunnel_timeout"
    }
}

func classifyTLSError(err error) string {
    errStr := err.Error()
    switch {
    case strings.Contains(errStr, "certificate has expired"):     return "tls_cert_expired"
    case strings.Contains(errStr, "unknown authority"):           return "tls_cert_untrusted"
    case strings.Contains(errStr, "hostname mismatch"):           return "tls_hostname_mismatch"
    case strings.Contains(errStr, "protocol version"):            return "tls_version_unsupported"
    default:                                                       return "tls_handshake_failed"
    }
}
```

### Acceptance Criteria — Task 6
- [ ] HTTPS tester gửi CONNECT tunnel qua proxy
- [ ] TLS handshake trong tunnel hoạt động
- [ ] Xoay vòng đủ 6 methods qua HTTPS
- [ ] httptrace đo đúng: tcp_connect_ms, tls_handshake_ms, ttfb_ms, total_ms
- [ ] `is_https = true`, `tls_version` có giá trị, `tls_cipher` có giá trị
- [ ] Rate limiter giới hạn đúng 500 RPM
- [ ] Error classification phân biệt: CONNECT fail vs TLS fail vs HTTPS fail
- [ ] Dừng khi nhận stop signal

---

## Task 7: Go Runner — Engine

### Mục tiêu
Orchestrator quản lý 4 goroutines, scheduler quản lý multi-proxy, result_collector tổng hợp.

### Files cần tạo

```
runner/internal/engine/
├── orchestrator.go      ← Quản lý lifecycle 1 proxy (4 goroutines)
├── scheduler.go         ← Quản lý nhiều proxy song song
└── result_collector.go  ← Thu thập samples, tính percentile + summary
```

### 7.1 Orchestrator (per proxy)

```go
type Orchestrator struct {
    config     RunConfig
    httpTester *HTTPTester
    httpsTester *HTTPSTester
    // wsTester   *WSTester     // Sprint 3
    collector  *ResultCollector
    reporter   Reporter
    logger     *slog.Logger
}

func (o *Orchestrator) Run(ctx context.Context) error {
    // Phase 0: Connectivity Check
    conn, connectMS, err := DialThroughProxy(ctx, o.config.Proxy)
    if err != nil {
        // Log ERROR, update status = "failed"
        return err
    }
    conn.Close()
    // Log INFO: connectivity pass

    // Phase 1: IP Check (placeholder Sprint 1 — chỉ GET /ip lấy IP)
    // Sprint 3: thêm DNSBL + Geo check

    // Phase 2: Warmup
    for i := 0; i < o.config.WarmupRequests; i++ {
        sample := o.httpTester.DoSingleRequest(ctx, "GET", "/echo", nil, i)
        sample.IsWarmup = true
        o.collector.Add(sample)
    }
    // Log INFO: warmup complete

    // Phase 3: Start 4 goroutines
    // Sprint 1: HTTP + HTTPS hoạt động đầy đủ, WS goroutine tồn tại nhưng chỉ log "placeholder"
    // Sprint 3: WS goroutine hoàn thiện (xem plan tổng Section 4.1 Goroutine 3 cho full spec)
    sampleChan := make(chan HTTPSample, 1000)

    g, gCtx := errgroup.WithContext(ctx)

    // Goroutine 1: HTTP (plain) — hoạt động đầy đủ Sprint 1
    g.Go(func() error { return o.httpTester.Run(gCtx) })

    // Goroutine 2: HTTPS (CONNECT tunnel) — hoạt động đầy đủ Sprint 1
    g.Go(func() error { return o.httpsTester.Run(gCtx) })

    // Goroutine 3: WS (ws + wss) — placeholder Sprint 1
    // Goroutine CHẠY nhưng chỉ log started/stopped, không gửi request
    // Sprint 3 sẽ implement đầy đủ: connect, echo messages, ping/pong, reconnect
    g.Go(func() error {
        o.logger.Info("WS goroutine started (placeholder)", "proxy_label", o.config.Proxy.Label)
        <-gCtx.Done()
        o.logger.Info("WS goroutine stopped (placeholder)", "proxy_label", o.config.Proxy.Label)
        return nil
    })

    // Goroutine 4: Rolling Summary
    g.Go(func() error { return o.rollingSummary(gCtx) })

    // Goroutine: Collect samples → batch report
    g.Go(func() error { return o.collectAndReport(gCtx, sampleChan) })

    return g.Wait()
}
```

### 7.2 Rolling Summary (mỗi 30 giây)

```go
func (o *Orchestrator) rollingSummary(ctx context.Context) error {
    ticker := time.NewTicker(time.Duration(o.config.SummaryIntervalSec) * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            // Final summary
            summary := o.collector.ComputeSummary()
            o.reporter.ReportSummary(summary)
            return nil
        case <-ticker.C:
            summary := o.collector.ComputeSummary()
            o.reporter.ReportSummary(summary)
            // Log INFO: rolling summary
        }
    }
}
```

### 7.3 Scheduler (multi-proxy, Sprint 1 chạy 1 proxy)

```go
type Scheduler struct {
    maxParallel int  // semaphore, max 10
}

func (s *Scheduler) RunAll(ctx context.Context, runs []RunConfig) {
    sem := make(chan struct{}, s.maxParallel)
    var wg sync.WaitGroup

    for _, run := range runs {
        wg.Add(1)
        sem <- struct{}{} // acquire

        go func(r RunConfig) {
            defer wg.Done()
            defer func() { <-sem }() // release

            orch := NewOrchestrator(r)
            if err := orch.Run(ctx); err != nil {
                // Log ERROR
            }
        }(run)
    }

    wg.Wait()
}
```

### 7.4 Result Collector

```go
type ResultCollector struct {
    mu          sync.RWMutex
    httpSamples []HTTPSample  // tất cả samples (bao gồm warmup)
}

func (c *ResultCollector) ComputeSummary() RunSummary {
    c.mu.RLock()
    defer c.mu.RUnlock()

    // Filter: non-warmup samples only
    var valid []HTTPSample
    var httpCount, httpsCount int
    for _, s := range c.httpSamples {
        if !s.IsWarmup {
            valid = append(valid, s)
            if s.IsHTTPS { httpsCount++ } else { httpCount++ }
        }
    }

    // Tính percentile TTFB
    ttfbs := extractField(valid, "TTFBMS")
    summary.TTFBAvgMS = stats.Mean(ttfbs)
    summary.TTFBP50MS, _ = stats.Percentile(ttfbs, 50)
    summary.TTFBP95MS, _ = stats.Percentile(ttfbs, 95)
    summary.TTFBP99MS, _ = stats.Percentile(ttfbs, 99)

    // Uptime
    successCount := countWhere(valid, func(s HTTPSample) bool { return s.ErrorType == "" })
    summary.UptimeRatio = float64(successCount) / float64(len(valid))

    // Jitter = stddev of total_ms
    totals := extractField(valid, "TotalMS")
    summary.JitterMS, _ = stats.StandardDeviation(totals)

    return summary
}
```

### Acceptance Criteria — Task 7
- [ ] Orchestrator chạy Phase 0 → 1 → 2 → 3 → 4 tuần tự
- [ ] Phase 3: HTTP + HTTPS goroutines chạy song song
- [ ] Rolling summary tính mỗi 30 giây
- [ ] Summary đúng: percentiles, uptime, jitter
- [ ] Stop signal → tất cả goroutines dừng gracefully (max 10s)
- [ ] Final summary tính xong trước khi exit
- [ ] Scheduler chạy được 1 proxy (Sprint 1)

---

## Task 8: Go Runner — Reporter + Scorer

### Files cần tạo

```
runner/internal/
├── reporter/
│   ├── api_reporter.go     ← POST samples/summary tới Controller API
│   └── db_reporter.go      ← Insert trực tiếp vào PG (alternative)
└── scoring/
    └── scorer.go           ← Tính score: uptime + latency + jitter
```

### 8.1 API Reporter

```go
type APIReporter struct {
    apiURL    string    // http://api:8000/api/v1
    batchSize int       // 50
    client    *http.Client
}

func (r *APIReporter) ReportHTTPSamples(runID string, samples []HTTPSample) error {
    // POST /api/v1/runs/:id/http-samples/batch
    // Body: { samples: [...] }
    // Retry 3 lần nếu fail
}

func (r *APIReporter) ReportSummary(runID string, summary RunSummary) error {
    // POST /api/v1/runs/:id/summary
}

func (r *APIReporter) UpdateStatus(runID string, status string) error {
    // PATCH /api/v1/runs/:id/status
}
```

### 8.2 Scorer (Sprint 1: 3 components)

```go
func ComputeScore(summary *RunSummary) {
    // S_uptime = success / total
    summary.ScoreUptime = summary.UptimeRatio

    // S_latency = clamp(1 - (ttfb_p95 / 500), 0, 1)
    summary.ScoreLatency = clamp(1.0 - (summary.TTFBP95MS / 500.0), 0, 1)

    // S_jitter = clamp(1 - (jitter / 100), 0, 1)
    summary.ScoreJitter = clamp(1.0 - (summary.JitterMS / 100.0), 0, 1)

    // Sprint 1: chưa có WS và Security → redistribute weight
    // Thay vì 0.25 + 0.25 + 0.15 + 0.15 + 0.20
    // → Normalize: uptime=0.385, latency=0.385, jitter=0.230
    totalWeight := 0.25 + 0.25 + 0.15  // = 0.65
    summary.ScoreTotal = (0.25/totalWeight)*summary.ScoreUptime +
                         (0.25/totalWeight)*summary.ScoreLatency +
                         (0.15/totalWeight)*summary.ScoreJitter
}
```

### Acceptance Criteria — Task 8
- [ ] API Reporter POST samples tới API → data vào DB
- [ ] API Reporter POST summary tới API → data vào DB
- [ ] Retry 3 lần khi API fail
- [ ] Score tính đúng (uptime + latency + jitter, redistribute weight)
- [ ] Score nằm trong [0.0, 1.0]

---

## Task 9: Integration Test (End-to-End)

### Mục tiêu
Test luồng hoàn chỉnh: API tạo run → trigger Runner → Runner test proxy → kết quả vào DB.

### Kịch bản test

> **Lưu ý**: Sprint 1 test bằng cách dùng proxy **giả** (Target Service ở localhost chính là "proxy" — Runner gọi thẳng Target, không qua proxy thật). Mục đích là verify luồng E2E, không phải chất lượng proxy.

```
Bước 1: docker compose up -d
  → Verify: tất cả 5 services start (postgres, target, api, runner, dashboard)

Bước 2: Tạo provider qua API
  curl -X POST http://localhost:8000/api/v1/providers \
    -H 'Content-Type: application/json' \
    -d '{"name":"TestProvider","website":"https://test.com"}'

Bước 3: Tạo proxy qua API
  curl -X POST http://localhost:8000/api/v1/proxies \
    -H 'Content-Type: application/json' \
    -d '{"provider_id":"<uuid>","label":"Test-Proxy-1","host":"target","port":3001,"auth_user":"","auth_pass":""}'

Bước 4: Tạo run
  curl -X POST http://localhost:8000/api/v1/runs \
    -H 'Content-Type: application/json' \
    -d '{"proxy_id":"<uuid>","http_rpm":60,"https_rpm":60}'
  → RPM thấp để test nhanh

Bước 5: Start run → trigger Runner
  curl -X POST http://localhost:8000/api/v1/runs/start \
    -d '{"run_ids":["<uuid>"]}'

Bước 6: Chờ 60 giây → verify data
  # Check http_samples
  curl http://localhost:8000/api/v1/runs/<id>/http-samples?limit=10
  → Phải có samples với:
    - is_https=false + method xoay vòng (GET/POST/PUT/PATCH/DELETE/HEAD)
    - is_https=true + method xoay vòng + tls_version có giá trị

  # Check summary
  curl http://localhost:8000/api/v1/runs/<id>/summary
  → Phải có: uptime_ratio, ttfb_p95, jitter, score_total

Bước 7: Stop run
  curl -X POST http://localhost:8000/api/v1/runs/<id>/stop
  → Status chuyển: running → stopping → completed

Bước 8: Verify final state
  curl http://localhost:8000/api/v1/runs/<id>
  → status = "completed"
  → total_http_samples > 0
  → total_https_samples > 0
```

### Verification Checklist tổng hợp

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose up -d` | 5 services start |
| 2 | `curl http://localhost:3001/health` | `{"status":"ok"}` |
| 3 | `curl -k https://localhost:3443/health` | `{"status":"ok"}` |
| 4 | Target `/echo` chấp nhận 6 methods | Mỗi method trả đúng format |
| 5 | API CRUD providers | Create, list, get, update, delete |
| 6 | API CRUD proxies | Create (pass encrypted), list (pass hidden) |
| 7 | API create + start run | Status = running, Runner nhận trigger |
| 8 | http_sample có `is_https=false` | HTTP goroutine samples |
| 9 | http_sample có `is_https=true` | HTTPS goroutine samples |
| 10 | http_sample.method xoay vòng | GET, POST, PUT, PATCH, DELETE, HEAD |
| 11 | HTTPS samples có `tls_handshake_ms > 0` | TLS đo được |
| 12 | HTTPS samples có `tls_version` | VD: "TLS 1.3" |
| 13 | warmup samples có `is_warmup=true` | Không đếm vào summary |
| 14 | RPM split hoạt động | ~500 HTTP + ~500 HTTPS per minute |
| 15 | Rolling summary mỗi 30s | run_summary được upsert |
| 16 | Score tính đúng | score_total trong [0, 1] |
| 17 | Stop → graceful shutdown | Status: stopping → completed |
| 18 | Runner logs structured JSON | Mọi log có timestamp, level, service, module |
| 19 | API logs structured JSON | Mọi log có request_id, duration_ms |
| 20 | Password không xuất hiện trong log | Grep password trong logs = 0 kết quả |

### Logging Verification Checklist (chi tiết)

> Ngoài 20 checks trên, verify cụ thể logging cho Sprint 1:

| # | Check | Cách verify | Expected |
|---|-------|-------------|----------|
| L1 | Runner startup log | `docker compose logs runner \| jq 'select(.phase == "startup")'` | Có `"Runner process starting"` + `port`, `api_url`, `go_version` |
| L2 | Connectivity phase log | Filter `phase == "connectivity"` | Có `"Connectivity check start"` + `"Connectivity check pass"` (hoặc fail) |
| L3 | Warmup per-request log | Filter `phase == "warmup"` | Có log **mỗi** warmup request (success/fail), không chỉ summary |
| L4 | Warmup summary log | Filter `phase == "warmup"` | Có `"Warmup complete"` + `success_count`, `fail_count`, `avg_ms` |
| L5 | HTTP goroutine start log | Filter `goroutine == "http"` | Có `"HTTP transport created"` + `"HTTP goroutine started"` + `http_rpm` |
| L6 | HTTPS goroutine start log | Filter `goroutine == "https"` | Có `"HTTPS transport created"` + `"HTTPS goroutine started"` + `https_rpm` |
| L7 | HTTP vs HTTPS log phân biệt | Filter `goroutine == "http"` vs `goroutine == "https"` | 2 goroutine RIÊNG BIỆT, không trộn lẫn |
| L8 | HTTPS 3 giai đoạn log riêng | Filter `goroutine == "https"` | Mỗi HTTPS request có: CONNECT tunnel log → TLS log → HTTPS request log |
| L9 | HTTPS lỗi biết gãy ở đâu | Tạo lỗi TLS → filter ERROR | `"CONNECT tunnel success"` rồi `"TLS handshake fail"` → biết gãy ở giai đoạn 2 |
| L10 | Phase field có mặt | `docker compose logs runner \| jq 'select(.phase == null)'` | **Không có** log entry nào thiếu `phase` (trừ startup) |
| L11 | request_type field | Filter `request_type == "echo"` vs `"bandwidth"` | Phân biệt được request /echo vs /large vs /slow vs /ip |
| L12 | Error log đủ fields | Filter `level == "ERROR"` | Mọi ERROR có `error_type` + `error_detail` + `goroutine` + `phase` |
| L13 | Cancel signal per goroutine | Bấm Stop → filter `phase == "stopping"` | Mỗi goroutine (http, https, ws) đều log `"Cancel signal received"` RIÊNG |
| L14 | Drain in-flight log | Bấm Stop → filter `"Draining"` | Có `"Draining in-flight requests"` + `pending_goroutines` + `drain_timeout_ms` |
| L15 | All goroutines stopped | Filter `phase == "stopping"` | Có `"All goroutines stopped"` + `total_goroutine_stop_ms` |
| L16 | Final summary log | Filter `phase == "final_summary"` | Có `"Final summary"` + `final_score` + totals + `"Orchestrator complete"` |
| L17 | Target log phân biệt HTTP/HTTPS | `docker compose logs target \| jq '.server_port'` | Request trên port 3001 có `protocol: "http"`, port 3443 có `protocol: "https"` |
| L18 | Sample channel warning | Nếu channel > 80% full | Có WARN `"Sample channel near capacity"` + `usage_percent` |
| L19 | Batch assembled log | Filter `"Batch assembled"` | Có `batch_size`, `http_count`, `https_count` |
| L20 | WS placeholder log | Filter `goroutine == "ws"` | Sprint 1: chỉ có `"WS goroutine started (placeholder)"` + `"WS goroutine stopped (placeholder)"` |

**Cách chạy logging verification tổng hợp**:
```bash
# 1. Chạy test 60 giây với RPM thấp
curl -X POST http://localhost:8000/api/v1/runs/start -d '{"run_ids":["<id>"]}'
sleep 60
curl -X POST http://localhost:8000/api/v1/runs/<id>/stop

# 2. Export tất cả Runner logs
docker compose logs runner --no-log-prefix > /tmp/runner-logs.json

# 3. Verify từng phase có log
for phase in startup connectivity warmup continuous stopping final_summary; do
  count=$(cat /tmp/runner-logs.json | jq "select(.phase == \"$phase\")" | wc -l)
  echo "Phase $phase: $count log entries"
done

# 4. Verify từng goroutine có log
for g in http https ws summary; do
  count=$(cat /tmp/runner-logs.json | jq "select(.goroutine == \"$g\")" | wc -l)
  echo "Goroutine $g: $count log entries"
done

# 5. Verify không có log thiếu phase
missing=$(cat /tmp/runner-logs.json | jq 'select(.phase == null and .module != "server.handler")' | wc -l)
echo "Logs missing phase field: $missing (should be 0)"

# 6. Verify error logs có đủ fields
errors=$(cat /tmp/runner-logs.json | jq 'select(.level == "ERROR" and (.error_type == null or .error_detail == null))' | wc -l)
echo "Errors missing error_type/error_detail: $errors (should be 0)"

# 7. Verify password không trong log
passwords=$(cat /tmp/runner-logs.json | grep -i "auth_pass" | wc -l)
echo "Password in logs: $passwords (should be 0)"
```

---

## Error Classification (reference)

> Sprint 1 implement đầy đủ 17 error types từ **plan tổng Section 10**.
> HTTP tester dùng: `timeout`, `connection_refused`, `proxy_auth_failed`, `proxy_error`, `connection_reset`, `unknown`.
> HTTPS tester dùng thêm: `connect_tunnel_failed`, `connect_tunnel_timeout`, `proxy_rejected`, `tls_handshake_failed`, `tls_cert_expired`, `tls_cert_untrusted`, `tls_hostname_mismatch`, `tls_version_unsupported`.
> WS error types (`ws_upgrade_failed`, `ws_pong_timeout`, `ws_unexpected_close`) implement ở Sprint 3.

Xem bảng đầy đủ: `PROXY-TEST-PLAN.md` → Section 10. Error Classification.

---

## KHÔNG làm trong Sprint 1 (deferred)

| Feature | Sprint | Ghi chú Sprint 1 |
|---------|--------|-------------------|
| Dashboard UI (form nhập, charts) | Sprint 2 | Chỉ có placeholder Next.js page |
| **WebSocket tester** (ws + wss) | Sprint 3 | **Goroutine 3 TỒN TẠI** nhưng chỉ log started/stopped, KHÔNG gửi request. Full spec xem plan tổng Section 4.1 Goroutine 3 |
| IP check (DNSBL + Geo) | Sprint 3 | Sprint 1 chỉ GET /ip lấy IP, không check DNSBL/Geo |
| Multi-proxy song song (10 proxies) | Sprint 3 | Sprint 1 test 1 proxy duy nhất |
| Concurrency burst test | Sprint 3 | Code structure sẵn, chưa kích hoạt |
| S_ws + S_security scoring | Sprint 3 | Sprint 1 chỉ có S_uptime + S_latency + S_jitter |
| Charts, comparison, export | Sprint 4 | — |

> **Quan trọng**: Sprint 1 tạo **4 goroutines** (không phải 3). WS goroutine chạy nhưng ở trạng thái placeholder — nó listen stop signal và log, nhưng không gửi WebSocket request. Điều này đảm bảo cấu trúc 4 goroutines đúng từ đầu, Sprint 3 chỉ cần thay placeholder bằng implementation thật.

---

## Go Dependencies (Sprint 1)

```
github.com/jackc/pgx/v5          # PostgreSQL driver (Runner → DB trực tiếp nếu cần)
gopkg.in/yaml.v3                  # YAML config (optional fallback)
golang.org/x/time/rate            # Token-bucket rate limiter
github.com/montanaflynn/stats     # Percentile calculation
github.com/google/uuid            # UUID generation
golang.org/x/sync/errgroup        # Manage goroutine groups
log/slog                          # Structured JSON logging (Go stdlib 1.21+, KHÔNG cần install)
```

> **Lưu ý**: `github.com/gorilla/websocket` chưa cần Sprint 1 — thêm ở Sprint 3 khi implement WS tester.
> **Logging**: Go Runner dùng `log/slog` (stdlib), KHÔNG dùng thư viện bên ngoài.

## Node.js Dependencies (Sprint 1)

**API**:
```
express                           # HTTP framework
pg                                # PostgreSQL client
pino + pino-http                  # Structured JSON logging
uuid                              # UUID generation
zod                               # Request validation
```

**Target**:
```
express                           # HTTP framework
pino                              # Logging
ws                                # WebSocket (placeholder)
```

---

## Sprint 1 Logging Reference — Task → Module → Log Points

> **Quan trọng**: Mỗi task khi implement PHẢI tham chiếu bảng log points tương ứng trong `PROXY-TEST-PLAN.md` → Section 9.3.
> Không implement logging "tự do" — phải đúng format, đúng fields, đúng level theo spec.

### Mapping tổng quan

| Task | Module(s) cần implement log | Tham chiếu Section 9.3 |
|------|----------------------------|------------------------|
| Task 1 | (không có code logic) | — |
| Task 2 | `index` (startup), `routes/*`, `ws/wsEcho` | Target Service — Modules & Log Points |
| Task 3 | `routes/*`, `services/*`, `db/pool`, `middleware/errorHandler` | Controller API — Modules & Log Points |
| Task 4 | `server.handler`, `config`, `proxy.dialer`, `domain/types` | Go Runner: `server.handler`, `config`, `proxy.dialer` |
| Task 5 | `proxy.http_tester` | Go Runner: `proxy.http_tester` |
| Task 6 | `proxy.https_tester` | Go Runner: `proxy.https_tester` |
| Task 7 | `engine.orchestrator`, `engine.scheduler`, `engine.result_collector` | Go Runner: `engine.*` |
| Task 8 | `reporter.api_reporter`, `reporter.db_reporter`, `scoring.scorer` | Go Runner: `reporter.*`, `scoring.scorer` |
| Task 9 | (verify tất cả log ở trên) | Logging Verification Checklist (L1-L20) |

### Quy tắc `phase` field

> **`phase` field CHỈ áp dụng cho Go Runner** (service: "runner"). Các service khác (Target, API, Dashboard) KHÔNG cần `phase`.
> Trong Go Runner, mọi log entry ở giai đoạn test (từ orchestrator start đến complete) **BẮT BUỘC** có `phase` field.
> `server.handler` module (Runner HTTP server) dùng `phase: "startup"` cho các event khởi động, nhưng không cần `phase` cho request handling (trigger/stop/health — đây là API handler, không phải test phase).

### Chi tiết log mỗi Task phải implement

#### Task 2 — Target Service Logging

```
Lib: pino
Logger setup: tạo 1 pino logger với base fields { service: "target" }
KHÔNG cần phase field (Target Service không phải Go Runner)
```

**Bắt buộc implement**:
- `index` (startup): HTTP server started, HTTPS server started, TLS cert loaded, All routes mounted
- `routes/*` (request handling): Request received (với `server_port` + `protocol`), Response sent, Large payload generated, Slow endpoint delay, Echo request received
- `ws/wsEcho` (WebSocket): WS connection opened, WS message echoed, WS connection closed, WS error

#### Task 3 — Controller API Logging

```
Lib: pino + pino-http
Logger setup: pino-http middleware auto-log request/response
                pino logger cho services layer
Base fields: { service: "api" }
Mỗi request: auto-generate request_id (UUID)
KHÔNG cần phase field (API không phải Go Runner)
```

**Bắt buộc implement**:
- `routes/*`: Request received, Response sent, Validation error, Not found
- `services/*`: Run created, Run triggered, Runner trigger fail, Run status changed, Stop requested, Stop forwarded, Summary received, Batch ingestion, Password encrypted
- `db/pool`: Pool connected, Pool connection fail, Query slow, Query error
- `middleware/errorHandler`: Unhandled error, 500 returned

#### Task 4 — Go Runner Foundation Logging

```
Lib: log/slog (stdlib)
Logger setup: slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
Base fields: slog.String("service", "runner")
Mỗi module: logger = logger.With(slog.String("module", "server.handler"))
BẮT BUỘC: Mọi log trong test phases (connectivity → final_summary) phải có "phase" field
          server.handler startup events dùng phase: "startup"
          server.handler API handler (trigger/stop/health) KHÔNG cần phase
```

**Bắt buộc implement**:
- `server.handler`: Runner process starting (với config summary), Runner server started, Trigger received, Stop signal received, Runner server shutdown, Invalid trigger request, Runner busy
- `config`: Config loaded from DB, Config validation fail, Password decrypted (KHÔNG log password)
- `proxy.dialer`: TCP connect start, TCP connect success, TCP connect fail, Auth success, Auth fail

**Ví dụ slog call cho dialer**:
```go
// proxy/dialer.go
func DialThroughProxy(ctx context.Context, proxy ProxyConfig, logger *slog.Logger) (net.Conn, time.Duration, error) {
    logger.Debug("TCP connect start",
        "proxy_host", proxy.Host,
        "proxy_port", proxy.Port,
        "phase", "connectivity",
    )

    start := time.Now()
    conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", proxy.Host, proxy.Port), timeout)
    connectMS := time.Since(start)

    if err != nil {
        logger.Error("TCP connect fail",
            "proxy_label", proxy.Label,
            "error_type", "connection_refused",
            "error_detail", err.Error(),
            "connect_ms", connectMS.Milliseconds(),
            "phase", "connectivity",
        )
        return nil, connectMS, err
    }

    logger.Info("TCP connect success",
        "proxy_label", proxy.Label,
        "connect_ms", connectMS.Milliseconds(),
        "phase", "connectivity",
    )
    return conn, connectMS, nil
}
```

#### Task 5 — HTTP Tester Logging

**Bắt buộc implement** (xem bảng đầy đủ: `PROXY-TEST-PLAN.md` Section 9.3 `proxy.http_tester`):
- HTTP transport created
- HTTP goroutine started
- HTTP request start (với `request_type`, `method`, `phase`)
- HTTP request success (với `request_type`, `method`, timing fields)
- HTTP request fail (với `error_type`, `error_detail`, `method`, `request_type`)
- HTTP latency spike
- HTTP non-200 status
- IP stability check
- Method batch complete
- Cancel signal received
- Draining in-flight request
- HTTP goroutine stopped

**request_type mapping**:
```go
func getRequestType(path string) string {
    switch {
    case strings.HasPrefix(path, "/echo"):    return "echo"
    case strings.HasPrefix(path, "/large"):   return "bandwidth"
    case strings.HasPrefix(path, "/slow"):    return "timeout_test"
    case strings.HasPrefix(path, "/ip"):      return "ip_check"
    default:                                   return "unknown"
    }
}
```

#### Task 6 — HTTPS Tester Logging

**Bắt buộc implement** (xem bảng đầy đủ: `PROXY-TEST-PLAN.md` Section 9.3 `proxy.https_tester`):

> **Quan trọng**: HTTPS mỗi request có 3 giai đoạn, mỗi giai đoạn PHẢI log riêng.
> Khi lỗi xảy ra → log entry cuối cùng cho biết gãy ở giai đoạn nào.

- HTTPS transport created
- HTTPS goroutine started
- HTTPS request start
- **Giai đoạn 1**: CONNECT tunnel start, success, fail, timeout, auth fail, rejected
- **Giai đoạn 2**: TLS handshake start, success, fail, cert error, version weak, cipher weak
- **Giai đoạn 3**: HTTPS request sent, response received, fail, latency spike, non-200 status
- HTTPS total timing (breakdown mỗi giai đoạn)
- HTTPS method batch complete
- Cancel signal received
- Draining in-flight request
- HTTPS goroutine stopped

#### Task 7 — Engine Logging

**Bắt buộc implement** (xem: `engine.orchestrator`, `engine.scheduler`, `engine.result_collector`):

**Orchestrator — theo phase**:
- `startup`: Orchestrator start
- `connectivity`: Connectivity check start, pass/fail
- `ip_check`: IP check start, complete/fail
- `warmup`: Warmup start, **mỗi warmup request** (success/fail), Warmup complete (với success_count + fail_count)
- `continuous`: Continuous phase start, All 4 goroutines running, Rolling summary, Rate limiter wait, Sample channel near capacity (WARN), Sample channel full (ERROR)
- `stopping`: Stop signal received, Draining in-flight requests, Goroutine stopped (mỗi goroutine), Drain timeout forced stop (nếu timeout), All goroutines stopped
- `final_summary`: Final summary, Orchestrator complete

**Scheduler**:
- Scheduler start, Proxy goroutine start/done, panic recovered, All proxies done

**Result Collector**:
- Batch assembled, Summary computed, Summary diff, Percentile calc, Percentile calc per protocol, No samples for metric

#### Task 8 — Reporter + Scorer Logging

**Reporter** (xem: `reporter.api_reporter`, `reporter.db_reporter`):
- Batch POST start/success/fail, Retry scheduled, All retries exhausted
- DB insert start/success/fail, DB connection fail

**Scorer** (xem: `scoring.scorer`):
- Score computed, Component scores, Phase skipped in scoring, All metrics null

---

## Files tổng cộng

| Loại | Số lượng |
|------|----------|
| Files mới | ~30 |
| Files sửa | ~11 |
| **Tổng** | **~41** |
