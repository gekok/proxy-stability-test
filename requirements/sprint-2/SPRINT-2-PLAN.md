# Sprint 2 — Dashboard UI + Basic Flow (Chi tiết)

> **Mục tiêu Sprint 2**: Xây Dashboard UI hoàn chỉnh — user nhập Provider/Proxy qua form, Start/Stop test qua nút bấm, xem kết quả realtime qua browser. UI là primary input method.

| Field | Value |
|-------|-------|
| Sprint | 2 / 4 |
| Thời gian | Week 3-4 |
| Input | Sprint 1 hoàn thành: 4 services chạy, API CRUD + Runner test 1 proxy |
| Output | Dashboard UI đầy đủ: CRUD forms, Start/Stop test, Realtime results, Overview page |

---

## Tổng quan Tasks (theo thứ tự dependency)

```
Task 1: Dashboard Project Setup + Layout + Navigation
  ↓
Task 2: API Client Module + Shared Types + Custom Hooks
  ↓
Task 3: Providers Page (List + CRUD Forms)         ←─┐
Task 4: Proxies Management (CRUD + Password)          │ Có thể song song:
Task 6: Runs List Page (Filter, Status Badges)     ←─┘ Task 3+4+6
  ↓
Task 5: Start Test Flow (Select proxies + Config + Trigger)
Task 7: Run Detail Page (Realtime polling + Stop)
  ↓
Task 8: Overview Page (Home Dashboard Summary)
  ↓
Task 9: Integration Test (E2E browser flow)
```

> Task 3, 4 và 6 có thể làm song song vì không phụ thuộc nhau — chỉ phụ thuộc Task 2 (API client + hooks).
> Task 5 phụ thuộc Task 3+4 (cần providers + proxies data).
> Task 7 phụ thuộc Task 6 (runs list navigation).

### Tech Stack

| Dependency | Mục đích |
|------------|----------|
| Next.js 14+ (App Router) | React framework, server/client components |
| TypeScript | Type safety |
| Tailwind CSS | Utility-first styling |
| pino | Server-side structured JSON logging |
| console (dev only) | Client-side logging (development) |

### Key Design Decisions

- **Polling 3-5s** cho realtime (không cần SSE/WebSocket — đơn giản, đủ dùng cho 10 proxies)
- **`NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`** — API URL từ env
- **Server-side logging**: pino JSON → `docker compose logs dashboard`
- **Client-side logging**: console.debug/info/warn (chỉ hiện trong DevTools, production stripped)
- **No state management library** — React hooks + fetch đủ cho scope Sprint 2

---

## Task 1: Dashboard Project Setup + Layout + Navigation

### Mục tiêu
Tạo Next.js project với Tailwind CSS, layout chung (sidebar + main content), reusable UI components, logger module, và Dockerfile.

### Files cần tạo

```
dashboard/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── Dockerfile
├── .env.local.example
├── public/
│   └── favicon.ico
└── src/
    ├── app/
    │   ├── layout.tsx              ← Root layout (sidebar + content area)
    │   ├── globals.css             ← Tailwind imports + custom styles
    │   ├── error.tsx               ← Global error boundary (logging)
    │   └── page.tsx                ← Home page (placeholder → Task 8)
    ├── components/
    │   ├── layout/
    │   │   └── Sidebar.tsx         ← Navigation sidebar
    │   └── ui/
    │       ├── Button.tsx
    │       ├── Badge.tsx
    │       ├── Card.tsx
    │       ├── Input.tsx
    │       ├── Select.tsx
    │       ├── Table.tsx
    │       ├── LoadingSpinner.tsx
    │       ├── ErrorAlert.tsx
    │       ├── EmptyState.tsx
    │       ├── Modal.tsx
    │       └── ConfirmDialog.tsx
    └── lib/
        └── logger.ts               ← pino logger { service: "dashboard" }
```

### 1.1 package.json

```json
{
  "name": "proxy-stability-dashboard",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0"
  }
}
```

### 1.2 next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // API proxy cho development (tránh CORS)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

> **`output: 'standalone'`**: Required cho Docker deployment — Next.js tạo minimal server bundle.

### 1.3 tailwind.config.ts

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Score color coding
        'score-good': '#22c55e',      // green — score >= 0.8
        'score-warning': '#eab308',   // yellow — score >= 0.5
        'score-bad': '#ef4444',       // red — score < 0.5
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
```

### 1.4 Layout (layout.tsx)

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Proxy Stability Test',
  description: 'Dashboard for proxy stability testing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 ml-64">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

### 1.5 Sidebar Navigation

```tsx
// src/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/',          label: 'Overview',    icon: 'Home' },
  { href: '/providers', label: 'Providers',   icon: 'Building' },
  { href: '/runs',      label: 'Test Runs',   icon: 'Play' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gray-900 text-white p-4">
      <div className="text-xl font-bold mb-8 px-2">
        Proxy Tester
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

### 1.6 UI Components (reusable)

**Button.tsx**:
```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}
```
- Variants: primary (blue), secondary (gray), danger (red), ghost (transparent)
- Loading state: disabled + spinner icon

**Badge.tsx**:
```tsx
interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  pulse?: boolean;   // animated pulse cho running/stopping status
  children: React.ReactNode;
}
```
- Dùng cho status badges (running, stopping, completed, failed, pending)

**Card.tsx**:
```tsx
interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}
```
- Container trắng, rounded, shadow

**Input.tsx** + **Select.tsx**:
- Controlled components với label, error message, required indicator
- Input types: text, number, password, email

**Table.tsx**:
```tsx
interface TableProps<T> {
  columns: { key: string; label: string; render?: (item: T) => React.ReactNode }[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}
```
- Generic table component, supports custom renderers, loading skeleton, empty state

**LoadingSpinner.tsx**: Spinner SVG, 3 sizes (sm/md/lg)

**ErrorAlert.tsx**:
```tsx
interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}
```
- Red alert box, optional retry button

**EmptyState.tsx**:
```tsx
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```
- Centered empty state với icon, title, description, optional action button

**Modal.tsx**:
```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}
```
- Overlay + centered dialog, click outside to close, Escape key

**ConfirmDialog.tsx**:
```tsx
interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
}
```
- Confirm/Cancel dialog cho delete operations

### 1.7 Logger (src/lib/logger.ts)

```typescript
// src/lib/logger.ts
import pino from 'pino';

// Server-side logger (pino)
// Chỉ dùng trong server components, API routes, middleware
export const logger = pino({
  name: 'dashboard',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'dashboard' },
});

// Dashboard startup log — gọi 1 lần khi module load
logger.info({
  api_url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  node_env: process.env.NODE_ENV || 'development',
  log_level: process.env.LOG_LEVEL || 'info',
  module: 'startup',
}, 'Dashboard started');

// Client-side: dùng console trực tiếp
// console.debug('[poll] started', { interval, source })
// console.info('Run status changed', { run_id, old_status, new_status })
// console.warn('[poll] fail', { error })
```

> **Quy tắc**: `pino` chỉ dùng server-side (Node.js runtime). Client components dùng `console.*` (chỉ hiện trong DevTools).

### 1.8 globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply text-gray-900 antialiased;
  }
}

@layer components {
  .score-cell {
    @apply font-mono text-sm font-semibold;
  }
  .score-good { @apply text-green-600; }
  .score-warning { @apply text-yellow-600; }
  .score-bad { @apply text-red-600; }
}
```

### 1.9 Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### 1.10 .env.local.example

```env
# API URL (accessed from browser)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# Log level
LOG_LEVEL=info
```

### Acceptance Criteria — Task 1
- [ ] `npm run dev` → Dashboard starts on http://localhost:3000
- [ ] Sidebar hiển thị 3 nav items: Overview, Providers, Test Runs
- [ ] Click nav items → navigate đúng routes
- [ ] Active nav item highlighted
- [ ] Layout: fixed sidebar + scrollable main content
- [ ] All UI components render đúng (Button variants, Badge variants, Table loading, Empty state, Modal, ConfirmDialog)
- [ ] `docker build` → image build thành công với standalone output
- [ ] Logger: `import { logger } from '@/lib/logger'` → pino JSON output
- [ ] `docker compose logs dashboard | head -5` → shows "Dashboard started" with api_url, node_env
- [ ] `src/app/error.tsx` exists → global error boundary catches unhandled errors

---

## Task 2: API Client Module + Shared Types + Custom Hooks

### Mục tiêu
Tạo fetch wrapper (logging, error handling), TypeScript types match DB schema, và React hooks cho CRUD operations + polling.

### Files cần tạo

```
dashboard/src/
├── lib/
│   └── api-client.ts           ← Fetch wrapper + logging
├── types/
│   └── index.ts                ← Provider, Proxy, TestRun, RunSummary, HttpSample
└── hooks/
    ├── usePolling.ts           ← Generic polling hook
    ├── useProviders.ts         ← Provider CRUD hook
    ├── useProxies.ts           ← Proxy CRUD hook
    ├── useRuns.ts              ← Runs list hook
    └── useRunDetail.ts         ← Single run + summary + samples
```

### 2.1 API Client (src/lib/api-client.ts)

Fetch wrapper với:
- Base URL từ `NEXT_PUBLIC_API_URL`
- Logging mọi call (start, success, fail, unreachable)
- Timeout handling
- Error classification (4xx vs 5xx vs network)
- JSON parse error handling

```typescript
// src/lib/api-client.ts
import { logger } from './logger';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const DEFAULT_TIMEOUT = 10000; // 10s

interface ApiResponse<T> {
  data: T;
  pagination?: {
    has_more: boolean;
    next_cursor: string | null;
    total_count: number;
  };
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T>(
    method: string,
    endpoint: string,
    options?: {
      body?: unknown;
      params?: Record<string, string>;
      timeout?: number;
      suppressNotFound?: boolean;  // true = 404 trả null thay vì throw + log WARN
    }
  ): Promise<ApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (options?.params) {
      Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const timeout = options?.timeout || DEFAULT_TIMEOUT;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Log #1: API call start
    logger.debug({ method, endpoint, params: options?.params, module: 'api-client' },
      'API call start');

    const startTime = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration_ms = Date.now() - startTime;

      // Log #3: API call success (no content) — 204
      if (response.status === 204) {
        logger.debug({
          method, endpoint, duration_ms, status_code: 204, module: 'api-client',
        }, 'API call success (no content)');
        return { data: null as T };
      }

      // Parse response body
      let body: unknown;
      const rawText = await response.text();
      try {
        body = JSON.parse(rawText);
      } catch {
        // Log #9: API response parse error
        logger.error({
          method, endpoint, status_code: response.status,
          raw_body: rawText.substring(0, 200), module: 'api-client',
        }, 'API response parse error');
        throw new Error(`Invalid JSON response from ${method} ${endpoint}`);
      }

      // 404 with suppressNotFound → return null silently (no WARN log)
      // Dùng cho: GET /runs/{id}/summary khi run mới chưa có summary
      if (response.status === 404 && options?.suppressNotFound) {
        logger.debug({
          method, endpoint, duration_ms, status_code: 404, module: 'api-client',
        }, 'API call not found (suppressed)');
        return { data: null as T };
      }

      // Log #4: API client error (4xx)
      if (response.status >= 400 && response.status < 500) {
        const apiError = body as ApiError;
        logger.warn({
          method, endpoint, status_code: response.status,
          error_detail: apiError.error?.message,
          validation_errors: apiError.error?.details,
          module: 'api-client',
        }, 'API client error (4xx)');
        throw new ApiClientError(response.status, apiError.error?.message || 'Client error', apiError.error?.details);
      }

      // Log #5: API server error (5xx)
      if (response.status >= 500) {
        const apiError = body as ApiError;
        logger.error({
          method, endpoint, status_code: response.status,
          error_detail: apiError.error?.message, module: 'api-client',
        }, 'API server error (5xx)');
        throw new ApiServerError(response.status, apiError.error?.message || 'Server error');
      }

      // Log #2: API call success
      logger.debug({
        method, endpoint, duration_ms, status_code: response.status,
        module: 'api-client',
      }, 'API call success');

      return body as ApiResponse<T>;

    } catch (error) {
      clearTimeout(timeoutId);
      const duration_ms = Date.now() - startTime;

      if (error instanceof ApiClientError || error instanceof ApiServerError) {
        throw error; // Already logged above
      }

      // Log #6: API timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        logger.error({
          method, endpoint, timeout_ms: timeout, api_url: this.baseUrl,
          module: 'api-client',
        }, 'API timeout');
        throw new ApiTimeoutError(timeout, endpoint);
      }

      // Log #7: API connection refused
      if (error instanceof TypeError && error.message.includes('ECONNREFUSED')) {
        logger.error({
          api_url: this.baseUrl, error_detail: 'ECONNREFUSED',
          module: 'api-client',
        }, 'API connection refused');
        throw new ApiUnreachableError('Connection refused — API service may be down');
      }

      // Log #8: API unreachable (other network errors)
      logger.error({
        api_url: this.baseUrl,
        error_detail: error instanceof Error ? error.message : String(error),
        module: 'api-client',
      }, 'API unreachable');
      throw new ApiUnreachableError(
        error instanceof Error ? error.message : 'Network error'
      );
    }
  }

  // Convenience methods
  get<T>(endpoint: string, params?: Record<string, string>, opts?: { suppressNotFound?: boolean }) {
    return this.request<T>('GET', endpoint, { params, ...opts });
  }
  post<T>(endpoint: string, body: unknown) {
    return this.request<T>('POST', endpoint, { body });
  }
  put<T>(endpoint: string, body: unknown) {
    return this.request<T>('PUT', endpoint, { body });
  }
  delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

// Error classes
export class ApiClientError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
  }
}
export class ApiServerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiServerError';
  }
}
export class ApiTimeoutError extends Error {
  constructor(public timeout_ms: number, public endpoint: string) {
    super(`Request to ${endpoint} timed out after ${timeout_ms}ms`);
    this.name = 'ApiTimeoutError';
  }
}
export class ApiUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

export const apiClient = new ApiClient(API_URL);
```

### 2.2 Shared Types (src/types/index.ts)

> Types phải match DB schema (xem `PROXY-TEST-PLAN.md` Section 2).

```typescript
// src/types/index.ts

// === Provider ===
export interface Provider {
  id: string;            // UUID
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;    // ISO 8601
  updated_at: string;
}

export interface ProviderCreate {
  name: string;
  website?: string;
  notes?: string;
}

export interface ProviderUpdate {
  name?: string;
  website?: string;
  notes?: string;
}

// === Proxy ===
export interface Proxy {
  id: string;
  provider_id: string;
  provider_name?: string;  // joined from provider table
  label: string;
  host: string;
  port: number;
  protocol: 'http' | 'socks5';
  auth_user: string | null;
  // auth_pass_enc NEVER returned to client
  expected_country: string | null;
  is_dedicated: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProxyCreate {
  provider_id: string;
  label: string;
  host: string;
  port: number;
  protocol: 'http' | 'socks5';
  auth_user?: string;
  auth_pass?: string;       // plaintext → API encrypts
  expected_country?: string;
  is_dedicated?: boolean;
}

export interface ProxyUpdate {
  label?: string;
  host?: string;
  port?: number;
  protocol?: 'http' | 'socks5';
  auth_user?: string;
  auth_pass?: string;       // empty string = keep current password
  expected_country?: string;
  is_dedicated?: boolean;
}

// === Test Run ===
export type RunStatus = 'pending' | 'running' | 'stopping' | 'completed' | 'failed' | 'cancelled';

export interface TestRun {
  id: string;
  proxy_id: string;
  proxy_label?: string;     // joined
  provider_name?: string;   // joined
  status: RunStatus;
  config_snapshot: RunConfig;
  started_at: string | null;   // DB: started_at — set when status → 'running'
  stopped_at: string | null;   // DB: stopped_at — set when user clicks Stop
  ended_at: string | null;     // DB: finished_at — set when run completes (any terminal status)
  total_http_samples: number;
  total_https_samples: number;
  total_ws_samples: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunConfig {
  http_rpm: number;
  https_rpm: number;
  timeout_ms: number;
  warmup_requests: number;
}

export interface RunCreate {
  proxy_id: string;
  config?: Partial<RunConfig>;
}

// === Run Summary ===
export interface RunSummary {
  id: string;
  run_id: string;
  uptime_ratio: number;
  // Computed from DB fields: http_success_ratio = http_success_count / http_total_count
  // DB stores raw counts (INT), frontend computes ratios for display
  http_success_ratio: number;   // computed: http_success_count / http_total_count
  https_success_ratio: number;  // computed: https_success_count / https_total_count
  ttfb_p50_ms: number;
  ttfb_p95_ms: number;
  ttfb_p99_ms: number;
  // DB column: tls_p50_ms. TS uses descriptive name for clarity.
  tls_handshake_p50_ms: number | null;
  tls_handshake_p95_ms: number | null;  // DB: tls_p95_ms
  tls_handshake_p99_ms: number | null;  // DB: tls_p99_ms
  jitter_ms: number;
  total_samples: number;
  http_sample_count: number;
  https_sample_count: number;
  score_uptime: number;
  score_latency: number;
  score_jitter: number;
  score_total: number;
  measured_at: string;
}

// === HTTP Sample ===
export interface HttpSample {
  id: string;
  run_id: string;
  seq: number;
  method: string;
  is_https: boolean;
  is_warmup: boolean;
  status_code: number | null;
  tcp_connect_ms: number;
  tls_handshake_ms: number | null;
  ttfb_ms: number;
  total_ms: number;
  bytes_sent: number;
  bytes_received: number;
  error_type: string | null;
  error_detail: string | null;
  tls_version: string | null;
  tls_cipher: string | null;
  measured_at: string;
}

// === Default Config ===
export const DEFAULT_RUN_CONFIG: RunConfig = {
  http_rpm: 500,
  https_rpm: 500,
  timeout_ms: 10000,
  warmup_requests: 5,
};

// === Pagination ===
export interface PaginationInfo {
  has_more: boolean;
  next_cursor: string | null;
  total_count: number;
}

// === Score helpers ===
export function getScoreColor(score: number): 'good' | 'warning' | 'bad' {
  if (score >= 0.8) return 'good';
  if (score >= 0.5) return 'warning';
  return 'bad';
}

export function getScoreGrade(score: number): string {
  if (score >= 0.9) return 'A';
  if (score >= 0.8) return 'B';
  if (score >= 0.7) return 'C';
  return 'D';
}

export function getStatusBadgeVariant(status: RunStatus) {
  switch (status) {
    case 'running':   return { variant: 'success' as const, pulse: true };
    case 'stopping':  return { variant: 'warning' as const, pulse: true };
    case 'completed': return { variant: 'info' as const,    pulse: false };
    case 'failed':    return { variant: 'error' as const,   pulse: false };
    case 'pending':   return { variant: 'neutral' as const, pulse: false };
    case 'cancelled': return { variant: 'default' as const, pulse: false };
  }
}

// === Duration helpers ===
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
```

### 2.3 usePolling Hook

```typescript
// src/hooks/usePolling.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions {
  interval: number;       // ms (3000 hoặc 5000)
  enabled: boolean;       // true = polling active
  source?: string;        // component name for logging
}

export function usePolling(
  fetchFn: () => Promise<void>,
  options: UsePollingOptions
) {
  const { interval, enabled, source = 'unknown' } = options;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const previousEnabledRef = useRef(enabled);

  const executePoll = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      await fetchFn();
      // Log #1 (usePolling): [poll] success
      if (process.env.NODE_ENV === 'development') {
        console.debug('[poll] success', { interval, source });
      }
    } catch (error) {
      // Log #2 (usePolling): [poll] fail
      if (process.env.NODE_ENV === 'development') {
        console.warn('[poll] fail', {
          error: error instanceof Error ? error.message : String(error),
          source,
        });
      }
    }
  }, [fetchFn, interval, source]);

  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      // Log #3 (usePolling): [poll] started
      if (process.env.NODE_ENV === 'development') {
        console.debug('[poll] started', { interval, source });
      }

      // Check if previously paused → now resumed
      if (!previousEnabledRef.current) {
        // Log #5 (usePolling): [poll] resumed
        if (process.env.NODE_ENV === 'development') {
          console.debug('[poll] resumed', { interval, source });
        }
      }

      // Initial fetch
      executePoll();

      // Start interval
      intervalRef.current = setInterval(executePoll, interval);
    } else {
      // Log #4 (usePolling): [poll] paused
      if (previousEnabledRef.current && process.env.NODE_ENV === 'development') {
        console.debug('[poll] paused', { reason: 'enabled=false', source });
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    previousEnabledRef.current = enabled;

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Log #6 (usePolling): [poll] cleanup
      if (process.env.NODE_ENV === 'development') {
        console.debug('[poll] cleanup', { reason: 'unmount', source });
      }
    };
  }, [enabled, interval, executePoll, source]);
}
```

### 2.4 useProviders Hook

```typescript
// src/hooks/useProviders.ts
'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Provider, ProviderCreate, ProviderUpdate } from '@/types';
import { logger } from '@/lib/logger';

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Provider[]>('/providers');
      setProviders(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch providers');
    } finally {
      setLoading(false);
    }
  }, []);

  const createProvider = useCallback(async (data: ProviderCreate) => {
    try {
      const res = await apiClient.post<Provider>('/providers', data);
      // Log: Provider created
      logger.info({ provider_name: data.name, module: 'pages/providers' },
        'Provider created');
      await fetchProviders(); // refresh list
      return res.data;
    } catch (err) {
      // Log: Provider create fail
      logger.warn({
        provider_name: data.name,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/providers',
      }, 'Provider create fail');
      throw err;
    }
  }, [fetchProviders]);

  const updateProvider = useCallback(async (id: string, data: ProviderUpdate) => {
    try {
      const res = await apiClient.put<Provider>(`/providers/${id}`, data);
      // Log: Provider updated
      logger.info({
        provider_id: id,
        provider_name: res.data.name,
        fields_changed: Object.keys(data),
        module: 'pages/providers',
      }, 'Provider updated');
      await fetchProviders();
      return res.data;
    } catch (err) {
      // Log: Provider update fail
      logger.warn({
        provider_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/providers',
      }, 'Provider update fail');
      throw err;
    }
  }, [fetchProviders]);

  const deleteProvider = useCallback(async (id: string, name: string) => {
    try {
      await apiClient.delete(`/providers/${id}`);
      // Log: Provider deleted
      logger.info({
        provider_id: id, provider_name: name, module: 'pages/providers',
      }, 'Provider deleted');
      await fetchProviders();
    } catch (err) {
      // Log: Provider delete fail
      logger.error({
        provider_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/providers',
      }, 'Provider delete fail');
      throw err;
    }
  }, [fetchProviders]);

  return { providers, loading, error, fetchProviders, createProvider, updateProvider, deleteProvider };
}
```

### 2.5 useProxies Hook

```typescript
// src/hooks/useProxies.ts
'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Proxy, ProxyCreate, ProxyUpdate } from '@/types';
import { logger } from '@/lib/logger';

export function useProxies(providerId?: string) {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProxies = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (providerId) params.provider_id = providerId;
      const res = await apiClient.get<Proxy[]>('/proxies', params);
      setProxies(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proxies');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const createProxy = useCallback(async (data: ProxyCreate) => {
    try {
      const res = await apiClient.post<Proxy>('/proxies', data);
      // Log: Proxy created
      logger.info({
        proxy_label: data.label,
        provider_id: data.provider_id,
        module: 'pages/proxies',
      }, 'Proxy created');
      await fetchProxies();
      return res.data;
    } catch (err) {
      // Log: Proxy create fail
      logger.warn({
        proxy_label: data.label,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/proxies',
      }, 'Proxy create fail');
      throw err;
    }
  }, [fetchProxies]);

  const updateProxy = useCallback(async (id: string, label: string, data: ProxyUpdate) => {
    try {
      const res = await apiClient.put<Proxy>(`/proxies/${id}`, data);
      // Log: Proxy updated — password_changed is boolean only, NEVER log password
      const passwordChanged = data.auth_pass !== undefined && data.auth_pass !== '';
      logger.info({
        proxy_id: id,
        proxy_label: label,
        fields_changed: Object.keys(data).filter(k => k !== 'auth_pass'),
        password_changed: passwordChanged,
        module: 'pages/proxies',
      }, 'Proxy updated');
      await fetchProxies();
      return res.data;
    } catch (err) {
      // Log: Proxy update fail
      logger.warn({
        proxy_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/proxies',
      }, 'Proxy update fail');
      throw err;
    }
  }, [fetchProxies]);

  const deleteProxy = useCallback(async (id: string, label: string, providerName: string) => {
    try {
      await apiClient.delete(`/proxies/${id}`);
      // Log: Proxy deleted
      logger.info({
        proxy_id: id, proxy_label: label, provider_name: providerName,
        module: 'pages/proxies',
      }, 'Proxy deleted');
      await fetchProxies();
    } catch (err) {
      // Log: Proxy delete fail
      logger.error({
        proxy_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/proxies',
      }, 'Proxy delete fail');
      throw err;
    }
  }, [fetchProxies]);

  return { proxies, loading, error, fetchProxies, createProxy, updateProxy, deleteProxy };
}
```

### 2.6 useRuns Hook

```typescript
// src/hooks/useRuns.ts
'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { TestRun, RunStatus } from '@/types';

export function useRuns(statusFilter?: RunStatus) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await apiClient.get<TestRun[]>('/runs', params);
      setRuns(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const hasActiveRuns = runs.some(r => r.status === 'running' || r.status === 'stopping');

  return { runs, loading, error, fetchRuns, hasActiveRuns };
}
```

### 2.7 useRunDetail Hook

```typescript
// src/hooks/useRunDetail.ts
'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { TestRun, RunSummary, HttpSample } from '@/types';
import { logger } from '@/lib/logger';

export function useRunDetail(runId: string) {
  const [run, setRun] = useState<TestRun | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [samples, setSamples] = useState<HttpSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  const firstSummaryReceivedRef = useRef(false);

  const fetchRunDetail = useCallback(async () => {
    try {
      // Fetch run + summary + recent samples in parallel
      // suppressNotFound: summary/samples may not exist yet for new runs → 404 is expected
      const [runRes, summaryRes, samplesRes] = await Promise.all([
        apiClient.get<TestRun>(`/runs/${runId}`),
        apiClient.get<RunSummary>(`/runs/${runId}/summary`, undefined, { suppressNotFound: true })
          .catch((err) => {
            // Log: Partial fetch failure — summary unavailable
            if (process.env.NODE_ENV === 'development') {
              console.warn('Run summary fetch failed', {
                run_id: runId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            return { data: null };
          }),
        apiClient.get<HttpSample[]>(`/runs/${runId}/http-samples`, { limit: '50' }, { suppressNotFound: true })
          .catch((err) => {
            // Log: Partial fetch failure — samples unavailable
            if (process.env.NODE_ENV === 'development') {
              console.warn('Run samples fetch failed', {
                run_id: runId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            return { data: [] };
          }),
      ]);

      const newRun = runRes.data;
      setRun(newRun);
      setSummary(summaryRes.data as RunSummary | null);
      setSamples((samplesRes.data || []) as HttpSample[]);
      setError(null);
      setLoading(false);

      // Client log: Run status changed
      if (previousStatusRef.current && previousStatusRef.current !== newRun.status) {
        if (process.env.NODE_ENV === 'development') {
          console.info('Run status changed', {
            run_id: runId,
            old_status: previousStatusRef.current,
            new_status: newRun.status,
          });
        }
      }
      previousStatusRef.current = newRun.status;

      // Client log: First summary received
      if (summaryRes.data && !firstSummaryReceivedRef.current) {
        firstSummaryReceivedRef.current = true;
        const s = summaryRes.data as RunSummary;
        if (process.env.NODE_ENV === 'development') {
          console.info('First summary received', {
            run_id: runId,
            score_total: s.score_total,
            total_samples: s.total_samples,
          });
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch run detail');
      setLoading(false);
    }
  }, [runId]);

  const stopRun = useCallback(async () => {
    try {
      const startedAt = run?.started_at ? new Date(run.started_at).getTime() : Date.now();
      const running_for_ms = Date.now() - startedAt;

      await apiClient.post(`/runs/${runId}/stop`, {});

      // Log: Test stopped
      logger.info({
        run_id: runId,
        proxy_label: run?.proxy_label,
        stopped_by: 'user',
        running_for_ms,
        module: 'pages/runs',
      }, 'Test stopped');

      await fetchRunDetail();
    } catch (err) {
      // Log: Test stop fail
      logger.error({
        run_id: runId,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages/runs',
      }, 'Test stop fail');
      throw err;
    }
  }, [runId, run, fetchRunDetail]);

  const isActive = run?.status === 'running' || run?.status === 'stopping';

  return { run, summary, samples, loading, error, fetchRunDetail, stopRun, isActive };
}
```

### Acceptance Criteria — Task 2
- [ ] `apiClient.get('/providers')` → returns data + logs "API call start" + "API call success"
- [ ] API 404 → logs "API client error (4xx)" at WARN level
- [ ] API 404 with `suppressNotFound: true` → logs DEBUG "API call not found (suppressed)", returns null
- [ ] API down → logs "API connection refused" at ERROR level
- [ ] `usePolling` với enabled=true → polls at interval, logs [poll] started/success
- [ ] `usePolling` với enabled=false → stops polling, logs [poll] paused
- [ ] Component unmount → logs [poll] cleanup with reason "unmount"
- [ ] `useProviders` CRUD → logs create/update/delete/fail correctly
- [ ] `useProxies` update với password → logs `password_changed: true/false` (NEVER password value)
- [ ] Types match DB schema fields: Provider, Proxy, TestRun, RunSummary, HttpSample
- [ ] `useRunDetail` partial fetch failure → logs console.warn "Run summary fetch failed" / "Run samples fetch failed"

---

## Task 3: Providers Page

### Mục tiêu
CRUD page cho providers: list table, add/edit modal form, delete with confirmation.

### Files cần tạo

```
dashboard/src/
├── app/
│   └── providers/
│       └── page.tsx                ← Providers page
└── components/
    └── providers/
        ├── ProviderList.tsx        ← Table display
        ├── ProviderForm.tsx        ← Add/Edit form (modal)
        └── DeleteProviderDialog.tsx ← Delete confirmation
```

### 3.1 Providers Page (page.tsx)

```tsx
// src/app/providers/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useProviders } from '@/hooks/useProviders';
import { useProxies } from '@/hooks/useProxies';
import { ProviderList } from '@/components/providers/ProviderList';
import { ProviderForm } from '@/components/providers/ProviderForm';
import { DeleteProviderDialog } from '@/components/providers/DeleteProviderDialog';
import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Provider } from '@/types';

export default function ProvidersPage() {
  const { providers, loading, error, fetchProviders, createProvider, updateProvider, deleteProvider } = useProviders();
  const { proxies, fetchProxies } = useProxies();
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);

  useEffect(() => {
    fetchProviders();
    fetchProxies();
  }, [fetchProviders, fetchProxies]);

  // ... render logic:
  // - Loading → LoadingSpinner
  // - Error → ErrorAlert with retry
  // - Empty → EmptyState with "Add Provider" action
  // - Data → ProviderList table
  // - Add button → opens ProviderForm (create mode)
  // - Edit click → opens ProviderForm (edit mode, pre-filled)
  // - Delete click → opens DeleteProviderDialog
}
```

### 3.2 Provider List

```tsx
// src/components/providers/ProviderList.tsx
interface ProviderListProps {
  providers: Provider[];
  proxies: Proxy[];      // to show proxy count per provider
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
}
```

**Table columns**:
| Column | Source | Width |
|--------|--------|-------|
| Name | `provider.name` | flex |
| Website | `provider.website` (link) | 200px |
| Proxies | count from proxies array | 80px |
| Created | `provider.created_at` formatted | 150px |
| Actions | Edit + Delete buttons | 120px |

### 3.3 Provider Form (Add/Edit Modal)

```tsx
// src/components/providers/ProviderForm.tsx
interface ProviderFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProviderCreate | ProviderUpdate) => Promise<void>;
  provider?: Provider;   // undefined = create mode, defined = edit mode
}
```

**Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | text | Yes | Unique, non-empty |
| website | text | No | URL format |
| notes | textarea | No | Free text |

**Validation**:
- `name` required → "Name is required"
- `name` empty string → "Name cannot be empty"
- On validation fail → client console.warn "Form validation failed"

```typescript
function validateProviderForm(data: ProviderCreate | ProviderUpdate): string[] {
  const errors: string[] = [];
  if (!data.name?.trim()) errors.push('name');

  if (errors.length > 0) {
    // Log: Form validation failed — client console only
    if (process.env.NODE_ENV === 'development') {
      console.warn('Form validation failed', {
        form_name: 'provider',
        fields_with_errors: errors,
      });
    }
  }
  return errors;
}
```

### 3.4 Delete Provider Dialog

```tsx
// src/components/providers/DeleteProviderDialog.tsx
interface DeleteProviderDialogProps {
  isOpen: boolean;
  provider: Provider;
  proxyCount: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}
```

**Message**: "Delete provider '{name}'? This will also delete {N} proxies and all associated test runs."

### Acceptance Criteria — Task 3
- [ ] `/providers` → shows provider list table
- [ ] "Add Provider" → modal form opens
- [ ] Fill name, submit → provider created, appears in list
- [ ] Duplicate name → error shown, WARN log "Provider create fail"
- [ ] Click Edit → form pre-filled with existing data
- [ ] Update name → list updated, INFO log "Provider updated" with fields_changed
- [ ] Click Delete → confirmation dialog with proxy count warning
- [ ] Confirm delete → provider removed, INFO log "Provider deleted"
- [ ] Empty state → shows "No providers yet" with "Add Provider" button
- [ ] API error → ErrorAlert with retry button

---

## Task 4: Proxies Management

### Mục tiêu
CRUD proxies grouped by provider, with special password handling (create/edit/never-return).

### Files cần tạo

```
dashboard/src/
└── components/
    └── proxies/
        ├── ProxyList.tsx           ← Proxies grouped by provider
        ├── ProxyForm.tsx           ← Add/Edit form (modal)
        ├── ProxyCard.tsx           ← Compact proxy display
        └── DeleteProxyDialog.tsx   ← Delete confirmation
```

> **Lưu ý**: Proxies được quản lý trong Providers page (expandable rows) — không cần page riêng.

### 4.1 Proxy List

```tsx
// src/components/proxies/ProxyList.tsx
interface ProxyListProps {
  proxies: Proxy[];
  providerId: string;
  providerName: string;
  onAdd: () => void;
  onEdit: (proxy: Proxy) => void;
  onDelete: (proxy: Proxy) => void;
}
```

**Table columns**:
| Column | Source | Width |
|--------|--------|-------|
| Label | `proxy.label` | flex |
| Host:Port | `proxy.host:proxy.port` | 200px |
| Protocol | `proxy.protocol` badge | 80px |
| Auth | "Yes" / "No" (based on auth_user existence) | 60px |
| Country | `proxy.expected_country` flag | 80px |
| Dedicated | checkbox icon | 60px |
| Active | toggle switch | 60px |
| Actions | Edit + Delete | 120px |

### 4.2 Proxy Form (Add/Edit)

```tsx
// src/components/proxies/ProxyForm.tsx
interface ProxyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProxyCreate | ProxyUpdate) => Promise<void>;
  proxy?: Proxy;          // undefined = create, defined = edit
  providers: Provider[];  // for provider_id select (create mode)
}
```

**Fields**:
| Field | Type | Required | Create | Edit |
|-------|------|----------|--------|------|
| provider_id | select | Yes (create) | Dropdown of providers | Disabled (can't change) |
| label | text | Yes | Empty | Pre-filled |
| host | text | Yes | Empty | Pre-filled |
| port | number | Yes | Empty | Pre-filled |
| protocol | select | Yes | "http" default | Pre-filled |
| auth_user | text | No | Empty | Pre-filled |
| auth_pass | password | No | Empty | **Placeholder: "Leave blank to keep current"** |
| expected_country | text | No | Empty | Pre-filled |
| is_dedicated | checkbox | No | false | Pre-filled |

### 4.3 Password Handling — Chi tiết

> **Security Critical**: Password KHÔNG BAO GIỜ lộ ra client.

**Create flow**:
```
1. User nhập password (type="password", masked)
2. Submit → POST /proxies { auth_pass: "plaintext" }
3. API encrypts → lưu auth_pass_enc vào DB
4. Response trả Proxy object → KHÔNG có auth_pass_enc
```

**Edit flow**:
```
1. Form load → auth_pass field TRỐNG
2. Placeholder: "Current password kept (leave blank to keep)"
3. User KHÔNG nhập → submit auth_pass = "" → API giữ password cũ
4. User NHẬP mới → submit auth_pass = "new_value" → API re-encrypt
5. Log: password_changed: true/false (KHÔNG BAO GIỜ log password value)
```

**Display flow**:
```
1. Proxy list hiển thị Auth column: "Yes" / "No"
2. KHÔNG hiển thị password, masked hay plain
3. API KHÔNG BAO GIỜ trả auth_pass_enc về client
```

### 4.4 Proxy Form Validation

```typescript
function validateProxyForm(data: ProxyCreate | ProxyUpdate, isCreate: boolean): string[] {
  const errors: string[] = [];
  if (isCreate) {
    if (!data.provider_id) errors.push('provider_id');
  }
  if (!data.label?.trim()) errors.push('label');
  if (!data.host?.trim()) errors.push('host');
  if (!data.port || data.port < 1 || data.port > 65535) errors.push('port');
  if (!['http', 'socks5'].includes(data.protocol || '')) errors.push('protocol');

  if (errors.length > 0) {
    // Log #7 (Proxy page): Proxy form validation fail — client console only
    if (process.env.NODE_ENV === 'development') {
      console.warn('Form validation failed', {
        form_name: 'proxy',
        fields_with_errors: errors,
      });
    }
  }
  return errors;
}
```

### Acceptance Criteria — Task 4
- [ ] Provider row expandable → shows proxy list for that provider
- [ ] "Add Proxy" → form with provider pre-selected
- [ ] Fill all required fields + password → proxy created
- [ ] Created proxy shows "Yes" in Auth column, password NOT displayed
- [ ] Edit proxy → password field empty with placeholder "Current password kept..."
- [ ] Submit edit without changing password → password preserved in DB
- [ ] Submit edit with new password → re-encrypted, log `password_changed: true`
- [ ] Delete proxy → confirmation + removal from list
- [ ] Invalid form → validation errors shown, client console.warn logged
- [ ] `grep "auth_pass" dashboard-logs` → 0 results (password NEVER in logs)

---

## Task 5: Start Test Flow

### Mục tiêu
Multi-step flow: select proxies → configure parameters → create runs → trigger → redirect.

### Files cần tạo

```
dashboard/src/
└── components/
    └── test/
        ├── ProxySelector.tsx       ← Checkbox list grouped by provider
        ├── TestConfigForm.tsx      ← RPM, timeout, warmup config
        └── StartTestDialog.tsx     ← Multi-step dialog (select → config → start)
```

### 5.1 Start Test Dialog (multi-step)

```tsx
// src/components/test/StartTestDialog.tsx
interface StartTestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Provider[];
  proxies: Proxy[];
}
```

**3 Steps**:

```
Step 1: Select Proxies
  ├── Proxies grouped by provider (sections)
  ├── Checkbox per proxy
  ├── "Select All" per provider
  ├── Show: label, host:port, protocol
  └── [Next] enabled khi >= 1 proxy selected

Step 2: Configure Test
  ├── http_rpm: number input (default 500)
  ├── https_rpm: number input (default 500)
  ├── timeout_ms: number input (default 10000)
  ├── warmup_requests: number input (default 5)
  ├── Note: "Leave defaults unless you know what you're doing"
  └── [Start Test] button

Step 3: Starting... (progress)
  ├── Creating runs: [1/N] ✓  [2/N] ✓  [3/N] ✗ (if fail)
  ├── Triggering runner...
  └── Redirect to runs page
```

### 5.2 Proxy Selector

```tsx
// src/components/test/ProxySelector.tsx
interface ProxySelectorProps {
  providers: Provider[];
  proxies: Proxy[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}
```

**UI**:
- Proxies grouped by provider name (expandable sections)
- Checkbox per proxy row
- "Select All" checkbox per provider section
- Show only active proxies (`is_active = true`)
- Disabled state if no active proxies

### 5.3 Test Config Form

```tsx
// src/components/test/TestConfigForm.tsx
interface TestConfigFormProps {
  config: RunConfig;
  onChange: (config: RunConfig) => void;
}
```

**Config fields with defaults**:
| Field | Label | Default | Min | Max |
|-------|-------|---------|-----|-----|
| http_rpm | HTTP requests/min | 500 | 10 | 2000 |
| https_rpm | HTTPS requests/min | 500 | 10 | 2000 |
| timeout_ms | Request timeout (ms) | 10000 | 1000 | 60000 |
| warmup_requests | Warmup requests | 5 | 0 | 50 |

**Validation**: min/max range, integer only.

```typescript
function validateTestConfig(config: RunConfig): string[] {
  const errors: string[] = [];
  if (config.http_rpm < 10 || config.http_rpm > 2000) errors.push('http_rpm');
  if (config.https_rpm < 10 || config.https_rpm > 2000) errors.push('https_rpm');
  if (config.timeout_ms < 1000 || config.timeout_ms > 60000) errors.push('timeout_ms');
  if (config.warmup_requests < 0 || config.warmup_requests > 50) errors.push('warmup_requests');

  if (errors.length > 0) {
    // Log: Form validation failed — client console only
    if (process.env.NODE_ENV === 'development') {
      console.warn('Form validation failed', {
        form_name: 'test_config',
        fields_with_errors: errors,
      });
    }
  }
  return errors;
}
```

### 5.4 Start Test Logic

```typescript
async function startTest(
  selectedProxyIds: string[],
  config: RunConfig,
) {
  const isDefault = config.http_rpm === 500 && config.https_rpm === 500
    && config.timeout_ms === 10000 && config.warmup_requests === 5;

  // Log: Test config customized (if not default)
  if (!isDefault) {
    logger.info({
      config: { http_rpm: config.http_rpm, https_rpm: config.https_rpm,
                timeout_ms: config.timeout_ms, warmup: config.warmup_requests },
      is_default: false,
      module: 'pages/test',
    }, 'Test config customized');
  }

  // Step 1: Create runs (one per proxy)
  const runIds: string[] = [];
  for (const proxyId of selectedProxyIds) {
    try {
      const res = await apiClient.post<TestRun>('/runs', {
        proxy_id: proxyId,
        config,
      });
      runIds.push(res.data.id);
    } catch (err) {
      // Log: Test start fail (create)
      logger.error({
        proxy_id: proxyId,
        error_detail: err instanceof Error ? err.message : String(err),
        created_so_far: runIds.length,
        module: 'pages/test',
      }, 'Test start fail (create)');
      throw err;
    }
  }

  // Log: Test runs created
  logger.info({
    run_ids: runIds, proxy_count: runIds.length, module: 'pages/test',
  }, 'Test runs created');

  // Step 2: Trigger runner
  try {
    await apiClient.post('/runs/start', { run_ids: runIds });
  } catch (err) {
    // Log: Test start fail (trigger)
    logger.error({
      run_ids: runIds,
      error_detail: err instanceof Error ? err.message : String(err),
      module: 'pages/test',
    }, 'Test start fail (trigger)');
    throw err;
  }

  // Log: Test started
  logger.info({
    run_ids: runIds, proxy_count: runIds.length, started_by: 'user',
    module: 'pages/test',
  }, 'Test started');

  return runIds;
}
```

### 5.5 Redirect Logic

```
After successful start:
  - 1 proxy selected → redirect to /runs/{runId}  (single run detail)
  - Multiple proxies → redirect to /runs?status=running  (filtered list)
```

### Acceptance Criteria — Task 5
- [ ] "Start Test" button → opens dialog
- [ ] Proxy list grouped by provider, checkboxes work
- [ ] "Select All" per provider toggles all proxies
- [ ] Config form shows defaults (500/500/10000/5)
- [ ] Change RPM → log "Test config customized" with is_default: false
- [ ] Start → creates runs + triggers, logs "Test runs created" + "Test started"
- [ ] 1 proxy → redirects to `/runs/{id}`
- [ ] Multiple proxies → redirects to `/runs?status=running`
- [ ] Create fail → log "Test start fail (create)" with created_so_far count
- [ ] Trigger fail → log "Test start fail (trigger)" with run_ids

---

## Task 6: Runs List Page

### Mục tiêu
List all test runs with filtering, status badges, auto-polling for active runs.

### Files cần tạo

```
dashboard/src/
├── app/
│   └── runs/
│       └── page.tsx                ← Runs list page
└── components/
    └── runs/
        ├── RunsList.tsx            ← Table display
        ├── RunsFilter.tsx          ← Status tabs + proxy dropdown
        └── RunStatusBadge.tsx      ← Status badge component
```

### 6.1 Runs List Page

```tsx
// src/app/runs/page.tsx
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRuns } from '@/hooks/useRuns';
import { usePolling } from '@/hooks/usePolling';
import { RunsList } from '@/components/runs/RunsList';
import { RunsFilter } from '@/components/runs/RunsFilter';
import { RunStatus } from '@/types';

export default function RunsPage() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') as RunStatus | null;
  const { runs, loading, error, fetchRuns, hasActiveRuns } = useRuns(statusFilter || undefined);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Auto-poll when active runs exist
  usePolling(fetchRuns, {
    interval: 5000,
    enabled: hasActiveRuns,
    source: 'RunsPage',
  });

  // ... render RunsFilter + RunsList
}
```

### 6.2 Runs Table

```tsx
// src/components/runs/RunsList.tsx
interface RunsListProps {
  runs: TestRun[];
  loading: boolean;
}
```

**Table columns**:
| Column | Source | Width | Notes |
|--------|--------|-------|-------|
| Proxy | `run.proxy_label` | flex | Link to `/runs/{id}` |
| Provider | `run.provider_name` | 150px | |
| Status | `RunStatusBadge` | 120px | Color + pulse |
| Score | `summary.score_total` | 80px | Color-coded |
| Latency P95 | `summary.ttfb_p95_ms` | 100px | "45 ms" |
| Uptime | `summary.uptime_ratio` | 80px | "99.2%" |
| Samples | `run.total_http_samples + total_https_samples` | 80px | |
| Duration | computed from started_at | 100px | formatDuration() |

### 6.3 Status Filter

```tsx
// src/components/runs/RunsFilter.tsx
interface RunsFilterProps {
  currentStatus: RunStatus | null;
  onStatusChange: (status: RunStatus | null) => void;
}
```

**Status tabs**: All | Running | Stopping | Completed | Failed

**Behavior**: Click tab → update URL query param `?status=running` → triggers re-fetch.

### 6.4 Status Badge (RunStatusBadge.tsx)

| Status | Color | Animation |
|--------|-------|-----------|
| running | Green | Pulse |
| stopping | Yellow | Pulse |
| completed | Blue | None |
| failed | Red | None |
| pending | Gray | None |

```tsx
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { variant, pulse } = getStatusBadgeVariant(status);
  return <Badge variant={variant} pulse={pulse}>{status}</Badge>;
}
```

### Acceptance Criteria — Task 6
- [ ] `/runs` → shows all runs in table
- [ ] Status filter tabs work (All/Running/Stopping/Completed/Failed)
- [ ] URL updates: `/runs?status=running`
- [ ] Running status → green badge with pulse animation
- [ ] Completed status → blue badge, no pulse
- [ ] Score column → color coded (green ≥ 0.8, yellow ≥ 0.5, red < 0.5)
- [ ] Click proxy label → navigates to `/runs/{id}`
- [ ] Active runs exist → auto-poll every 5s, data updates
- [ ] No active runs → polling stops
- [ ] Empty state → "No test runs yet"

---

## Task 7: Run Detail Page (phức tạp nhất)

### Mục tiêu
Realtime view of a single test run: header, summary cards, metrics detail, samples table, stop button. Polling 3s for active runs.

### Files cần tạo

```
dashboard/src/
├── app/
│   └── runs/
│       └── [runId]/
│           └── page.tsx            ← Run detail page
└── components/
    └── runs/
        ├── RunHeader.tsx           ← Title, status, duration, stop button
        ├── RunSummaryCards.tsx      ← 4 metric cards
        ├── RunMetricsDetail.tsx     ← Percentiles table, TLS, scoring
        ├── RunHttpSamples.tsx       ← Samples table with filters
        └── StopTestButton.tsx       ← Stop with confirmation
```

### 7.1 Run Detail Page

```tsx
// src/app/runs/[runId]/page.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useRunDetail } from '@/hooks/useRunDetail';
import { usePolling } from '@/hooks/usePolling';
import { RunHeader } from '@/components/runs/RunHeader';
import { RunSummaryCards } from '@/components/runs/RunSummaryCards';
import { RunMetricsDetail } from '@/components/runs/RunMetricsDetail';
import { RunHttpSamples } from '@/components/runs/RunHttpSamples';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { logger } from '@/lib/logger';

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, summary, samples, loading, error, fetchRunDetail, stopRun, isActive } = useRunDetail(runId);
  const pollingStartedRef = useRef(false);

  useEffect(() => { fetchRunDetail(); }, [fetchRunDetail]);

  // Realtime polling: 3s when running/stopping, stop when completed
  usePolling(fetchRunDetail, {
    interval: 3000,
    enabled: isActive,
    source: 'RunDetailPage',
  });

  // Client log: Realtime polling started/stopped
  useEffect(() => {
    if (isActive && !pollingStartedRef.current) {
      pollingStartedRef.current = true;
      if (process.env.NODE_ENV === 'development') {
        console.debug('Realtime polling started', { run_id: runId, interval_ms: 3000 });
      }
    }
    if (!isActive && pollingStartedRef.current) {
      pollingStartedRef.current = false;
      const reason = run?.status === 'completed' ? 'completed'
                   : run?.status === 'failed' ? 'failed' : 'unmount';
      if (process.env.NODE_ENV === 'development') {
        console.debug('Realtime polling stopped', { run_id: runId, reason });
      }
    }
  }, [isActive, runId, run?.status]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorAlert message={error} onRetry={fetchRunDetail} />;
  if (!run) return <ErrorAlert message="Run not found" />;

  return (
    <div className="space-y-6">
      <RunHeader run={run} onStop={stopRun} />
      <RunSummaryCards summary={summary} />
      <RunMetricsDetail summary={summary} run={run} />
      <RunHttpSamples samples={samples} />
    </div>
  );
}
```

### 7.2 Run Header

```tsx
// src/components/runs/RunHeader.tsx
interface RunHeaderProps {
  run: TestRun;
  onStop: () => Promise<void>;
}
```

**Display**:
- Proxy label (large text)
- Provider name (subtitle)
- Status badge (with pulse for running/stopping)
- Live duration counter (updates every second khi running)
- Stop button (visible khi running, disabled khi stopping)
- Back button → `/runs`

**Live duration counter**:
```tsx
// Tính từ started_at đến now, update mỗi giây
const [elapsed, setElapsed] = useState(0);
useEffect(() => {
  if (run.status !== 'running' || !run.started_at) return;
  const interval = setInterval(() => {
    setElapsed(Date.now() - new Date(run.started_at!).getTime());
  }, 1000);
  return () => clearInterval(interval);
}, [run.status, run.started_at]);
```

### 7.3 Summary Cards

```tsx
// src/components/runs/RunSummaryCards.tsx
interface RunSummaryCardsProps {
  summary: RunSummary | null;
}
```

**4 cards**:
| Card | Value | Color logic | Format |
|------|-------|-------------|--------|
| Score | `score_total` | green ≥ 0.8, yellow ≥ 0.5, red < 0.5 | "0.85" + grade "B" |
| Latency P95 | `ttfb_p95_ms` | green ≤ 200, yellow ≤ 500, red > 500 | "142 ms" |
| Uptime | `uptime_ratio` | green ≥ 0.95, yellow ≥ 0.9, red < 0.9 | "99.2%" |
| Samples | `total_samples` | neutral | "1,234" |

**Empty state**: Cards show "--" when no summary yet.

### 7.4 Metrics Detail

```tsx
// src/components/runs/RunMetricsDetail.tsx
interface RunMetricsDetailProps {
  summary: RunSummary | null;
  run: TestRun;
}
```

**Sections**:

**Percentiles table**:
| Metric | P50 | P95 | P99 |
|--------|-----|-----|-----|
| TTFB | `ttfb_p50_ms` | `ttfb_p95_ms` | `ttfb_p99_ms` |
| TLS Handshake | `tls_handshake_p50_ms` | `tls_handshake_p95_ms` | `tls_handshake_p99_ms` |

**Protocol breakdown**:
| Protocol | Success Rate | Samples |
|----------|-------------|---------|
| HTTP | `http_success_ratio` | `http_sample_count` |
| HTTPS | `https_success_ratio` | `https_sample_count` |

**Scoring breakdown**:
| Component | Weight | Score |
|-----------|--------|-------|
| Uptime | 38.5% | `score_uptime` |
| Latency | 38.5% | `score_latency` |
| Jitter | 23.0% | `score_jitter` |
| **Total** | 100% | `score_total` |

> Sprint 1 scoring: 3 components (Uptime, Latency, Jitter). WS + Security added in Sprint 3.

### 7.5 HTTP Samples Table

```tsx
// src/components/runs/RunHttpSamples.tsx
interface RunHttpSamplesProps {
  samples: HttpSample[];
}
```

**Table columns**:
| Column | Source | Width |
|--------|--------|-------|
| # | seq | 50px |
| Method | method badge | 80px |
| Protocol | "HTTP"/"HTTPS" from is_https | 80px |
| Status | status_code (200=green, else red) | 60px |
| TTFB | ttfb_ms | 80px |
| Total | total_ms | 80px |
| TLS | tls_handshake_ms (HTTPS only) | 80px |
| Error | error_type | 120px |
| Time | measured_at | 150px |

**Filters** (tabs):
- All | HTTP only | HTTPS only | Errors only

**Recent 50 samples** — sorted by seq descending (newest first).

### 7.6 Stop Test Button

```tsx
// src/components/runs/StopTestButton.tsx
interface StopTestButtonProps {
  run: TestRun;
  onStop: () => Promise<void>;
}
```

**Flow**:
1. Button visible khi `status === 'running'`
2. Click → ConfirmDialog: "Stop test for {proxy_label}? Running for {duration}."
3. Confirm → POST /runs/:id/stop
4. Button disabled + "Stopping..." text khi `status === 'stopping'`
5. Status animation: running(green-pulse) → stopping(yellow-pulse) → completed(blue)

### 7.7 Error Page Handling

**Per-page error** (run not found):
```tsx
// src/app/runs/[runId]/page.tsx — error handling
// When runId is invalid (UUID format wrong or not found):
if (!run && !loading) {
  // Log: Page error
  logger.error({
    page_path: `/runs/${runId}`,
    error_detail: 'Run not found',
    module: 'pages/runs',
  }, 'Page error');

  return <ErrorAlert title="Run Not Found" message={`No test run with ID ${runId}`} />;
}
```

### 7.8 Global Error Boundary (áp dụng cho TẤT CẢ pages)

> **G5 fix**: Mỗi page cần handle error state. Global error boundary bắt unhandled errors.

**File**: `src/app/error.tsx` (Next.js App Router error boundary)

```tsx
// src/app/error.tsx
'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import { ErrorAlert } from '@/components/ui/ErrorAlert';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log: Page error (global)
    logger.error({
      page_path: window.location.pathname,
      error_detail: error.message,
      error_digest: error.digest,
      module: 'pages/error-boundary',
    }, 'Page error');
  }, [error]);

  return (
    <ErrorAlert
      title="Something went wrong"
      message={error.message}
      onRetry={reset}
    />
  );
}
```

**Mỗi page cũng log error state riêng**:
```tsx
// Pattern áp dụng cho providers/page.tsx, runs/page.tsx, page.tsx (overview)
if (error) {
  logger.error({
    page_path: '/providers',  // hoặc '/runs', '/'
    error_detail: error,
    module: 'pages/providers',  // hoặc 'pages/runs', 'pages/overview'
  }, 'Page error');

  return <ErrorAlert message={error} onRetry={fetchProviders} />;
}
```

### Acceptance Criteria — Task 7
- [ ] `/runs/{id}` → shows run detail page
- [ ] RunHeader: proxy label, status badge, live duration counter
- [ ] SummaryCards: 4 cards with color-coded values
- [ ] Score card: green for ≥ 0.8, yellow ≥ 0.5, red < 0.5
- [ ] MetricsDetail: percentiles table, protocol breakdown, scoring breakdown
- [ ] HttpSamples: table with method, protocol, status, timing
- [ ] Samples filter: All / HTTP / HTTPS / Errors
- [ ] Running → polls every 3s, data updates automatically
- [ ] Completed → polling stops
- [ ] Stop button → confirmation → status transitions with animation
- [ ] Invalid run ID → "Run Not Found" error + log "Page error"
- [ ] Client console: "Run status changed", "First summary received", "Realtime polling started/stopped"
- [ ] After stop → log "Test stopped" with running_for_ms

---

## Task 8: Overview Page (Home Dashboard)

### Mục tiêu
Home page with summary stats, active tests list, recent results.

### Files cần tạo

```
dashboard/src/
├── app/
│   └── page.tsx                    ← Home page (replace placeholder)
└── components/
    └── overview/
        ├── StatCards.tsx            ← 3 summary stat cards
        ├── ActiveRunsList.tsx       ← Currently running tests
        └── RecentResultsList.tsx    ← Last 5 completed/failed
```

### 8.1 Overview Page

```tsx
// src/app/page.tsx
'use client';

import { useEffect } from 'react';
import { useProviders } from '@/hooks/useProviders';
import { useProxies } from '@/hooks/useProxies';
import { useRuns } from '@/hooks/useRuns';
import { usePolling } from '@/hooks/usePolling';
import { StatCards } from '@/components/overview/StatCards';
import { ActiveRunsList } from '@/components/overview/ActiveRunsList';
import { RecentResultsList } from '@/components/overview/RecentResultsList';

export default function OverviewPage() {
  const { providers, fetchProviders } = useProviders();
  const { proxies, fetchProxies } = useProxies();
  const { runs, fetchRuns, hasActiveRuns } = useRuns();

  useEffect(() => {
    fetchProviders();
    fetchProxies();
    fetchRuns();
  }, [fetchProviders, fetchProxies, fetchRuns]);

  // Poll when active runs exist
  usePolling(fetchRuns, {
    interval: 5000,
    enabled: hasActiveRuns,
    source: 'OverviewPage',
  });

  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'stopping');
  const recentResults = runs
    .filter(r => r.status === 'completed' || r.status === 'failed')
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Overview</h1>
      <StatCards
        providersCount={providers.length}
        proxiesCount={proxies.length}
        activeRunsCount={activeRuns.length}
      />
      <ActiveRunsList runs={activeRuns} />
      <RecentResultsList runs={recentResults} />
    </div>
  );
}
```

### 8.2 Stat Cards

```tsx
// src/components/overview/StatCards.tsx
interface StatCardsProps {
  providersCount: number;
  proxiesCount: number;
  activeRunsCount: number;
}
```

**3 cards**:
| Card | Value | Icon | Color |
|------|-------|------|-------|
| Providers | count | Building | Blue |
| Proxies | count | Server | Purple |
| Active Tests | count | Play | Green (pulse if > 0) |

### 8.3 Active Runs List

```tsx
// src/components/overview/ActiveRunsList.tsx
interface ActiveRunsListProps {
  runs: TestRun[];
}
```

**Compact rows**:
- Proxy label + provider name
- Status badge
- Duration (live counter)
- Score (if summary available)
- Link to `/runs/{id}`

**Empty**: "No active tests" with "Start Test" button.

### 8.4 Recent Results List

```tsx
// src/components/overview/RecentResultsList.tsx
interface RecentResultsListProps {
  runs: TestRun[];
}
```

**Compact rows**:
- Proxy label + provider name
- Status badge (completed/failed)
- Score (color-coded)
- Duration
- Ended at (relative time: "5 minutes ago")
- Link to `/runs/{id}`

**Empty**: "No completed tests yet".

### Acceptance Criteria — Task 8
- [ ] `/` → Overview page loads
- [ ] 3 stat cards: providers count, proxies count, active runs count
- [ ] Active runs count card pulses when > 0
- [ ] Active tests list shows running/stopping tests with live duration
- [ ] Recent results shows last 5 completed/failed with score
- [ ] Click any run → navigates to `/runs/{id}`
- [ ] Active runs exist → auto-poll, stats update
- [ ] No data → appropriate empty states

---

## Task 9: Integration Test (E2E browser flow)

### Mục tiêu
End-to-end test kịch bản qua browser, verify toàn bộ flow + logging.

### Kịch bản test (9 bước)

```
Bước 1: docker compose up -d
  → 5 services start: postgres, target, api, runner, dashboard

Bước 2: Open http://localhost:3000
  → Dashboard loads, Sidebar visible, Overview page shows 0/0/0

Bước 3: Navigate to /providers → Add Provider
  → Create "BrightData" (website: brightdata.com, notes: "Test provider")
  → Provider appears in list

Bước 4: Add Proxy to BrightData
  → Create proxy (label: "BD-US-1", host: proxy.brightdata.com, port: 22225,
     protocol: http, auth_user: user123, auth_pass: pass456,
     expected_country: US, is_dedicated: true)
  → Proxy appears under BrightData, Auth = "Yes", password NOT visible

Bước 5: Start Test
  → Click "Start Test" → Select BD-US-1 → Config (defaults) → Start
  → Redirected to /runs/{id}

Bước 6: Watch Realtime Results (30 seconds)
  → Status = running (green pulse)
  → Duration counter increases
  → Score appears (after first summary ~30s)
  → Latency, Uptime, Samples update
  → HTTP Samples table populates

Bước 7: Stop Test
  → Click Stop → Confirm
  → Status: running → stopping → completed
  → Duration stops counting
  → Final score displayed

Bước 8: Verify Persistence
  → Close browser tab
  → Reopen http://localhost:3000
  → Overview shows correct counts
  → /runs → completed run visible
  → /runs/{id} → all data preserved

Bước 9: Start New Test + Close Browser
  → Start new test for BD-US-1
  → Close browser while running
  → Reopen browser → Overview shows 1 active run
  → /runs → running test visible, data updating
```

### Verification Checklist (20 functional checks)

| # | Check | Expected |
|---|-------|----------|
| 1 | `docker compose up -d` | 5 services start |
| 2 | `http://localhost:3000` | Dashboard loads, sidebar visible |
| 3 | Create provider | Appears in list |
| 4 | Create proxy (with password) | Password NOT shown back |
| 5 | Select proxy → Start Test | Status = running |
| 6 | Wait 30s | Score + latency + uptime appear, auto-update |
| 7 | Stop Test | running → stopping → completed |
| 8 | Close browser, reopen | Data still there |
| 9 | Start test → close browser → reopen | Test still running |
| 10 | Overview page | Stats correct (providers, proxies, active runs) |
| 11 | Edit provider | Data updated in list |
| 12 | Edit proxy (keep password) | Existing password preserved |
| 13 | Edit proxy (new password) | Re-encrypted in DB |
| 14 | Delete provider | Cascade removes proxies + runs |
| 15 | Runs list filter | Status filter works |
| 16 | Runs list auto-poll | Updates when active runs exist |
| 17 | Run detail samples | HTTP + HTTPS samples visible |
| 18 | Score color coding | Green ≥ 0.8, yellow ≥ 0.5, red < 0.5 |
| 19 | Empty states | Shown when no data |
| 20 | Error handling | API unreachable → error alert |

### Logging Verification Checklist (DL1-DL15)

| # | Check | Cách verify | Expected |
|---|-------|-------------|----------|
| DL1 | Dashboard startup | `docker compose logs dashboard` | pino JSON format, `service: "dashboard"` |
| DL2 | API client: success | Filter `"API call success"` | method, endpoint, duration_ms, status_code |
| DL3 | API client: 4xx vs 5xx | Tạo request lỗi → filter logs | 4xx = WARN "API client error", 5xx = ERROR "API server error" |
| DL4 | API client: timeout vs refused | Tắt API → Dashboard fetch | "API connection refused" hoặc "API timeout" riêng biệt |
| DL5 | Provider CRUD logs | Create/Update/Delete provider | 3 log riêng: created, updated (fields_changed), deleted |
| DL6 | Provider fail log | Create duplicate name | WARN "Provider create fail" với error_detail |
| DL7 | Proxy CRUD logs | Create/Update/Delete proxy | 3 log riêng, update có `password_changed: true/false` |
| DL8 | Start Test logs | Start test | "Test runs created" + "Test started" (2 logs riêng) |
| DL9 | Start Test config log | Thay đổi RPM → Start | "Test config customized" với `is_default: false` |
| DL10 | Stop Test logs | Stop test | "Test stopped" với `running_for_ms` |
| DL11 | Stop fail log | Tắt Runner → Stop | ERROR "Test stop fail" |
| DL12 | Password not in logs | `grep "auth_pass" dashboard-logs` | 0 results |
| DL13 | Client console (dev) | Browser DevTools Console | [poll] started/success/fail/cleanup messages |
| DL14 | Status change log | Observe run completing | console.info "Run status changed" old_status→new_status |
| DL15 | Page error log | Navigate to invalid /runs/xxx | ERROR "Page error" với page_path, error_detail |
| DL16 | Dashboard startup | `docker compose logs dashboard \| head -5` | INFO "Dashboard started" với api_url, node_env |
| DL17 | Form validation logs | Submit empty provider name, invalid port | console.warn "Form validation failed" với form_name + fields |
| DL18 | Summary 404 suppressed | Start test → poll before first summary | DEBUG "API call not found (suppressed)" thay vì WARN |
| DL19 | Global error boundary | Force error in React component | ERROR "Page error" từ error.tsx |
| DL20 | Partial fetch failure | Tắt API giữa chừng polling | console.warn "Run summary fetch failed" hoặc "Run samples fetch failed" |

### Verify Script (bash)

```bash
#!/bin/bash
# Dashboard Logging Verification Script

echo "=== DL1: Dashboard Startup ==="
docker compose logs dashboard 2>&1 | head -5
# Expected: pino JSON with "service":"dashboard"

echo ""
echo "=== DL2: API Call Success ==="
docker compose logs dashboard 2>&1 | grep "API call success" | head -3
# Expected: method, endpoint, duration_ms, status_code

echo ""
echo "=== DL3: API Client Error (4xx) ==="
docker compose logs dashboard 2>&1 | grep "API client error" | head -3
# Expected: WARN level, status_code 400-499

echo ""
echo "=== DL5: Provider CRUD ==="
docker compose logs dashboard 2>&1 | grep -E "Provider (created|updated|deleted)" | head -5
# Expected: INFO level, fields_changed on update

echo ""
echo "=== DL7: Proxy CRUD + Password ==="
docker compose logs dashboard 2>&1 | grep -E "Proxy (created|updated|deleted)" | head -5
# Expected: INFO level, password_changed: true/false on update

echo ""
echo "=== DL8: Test Start ==="
docker compose logs dashboard 2>&1 | grep -E "Test (runs created|started)" | head -5
# Expected: 2 separate logs

echo ""
echo "=== DL10: Test Stop ==="
docker compose logs dashboard 2>&1 | grep "Test stopped" | head -3
# Expected: running_for_ms field

echo ""
echo "=== DL12: Password NOT in Logs ==="
count=$(docker compose logs dashboard 2>&1 | grep -i "auth_pass" | grep -v "password_changed" | wc -l)
echo "Password leak count: $count (should be 0)"

echo ""
echo "=== DL16: Dashboard Startup ==="
docker compose logs dashboard 2>&1 | grep "Dashboard started" | head -1
# Expected: INFO level, api_url, node_env

echo ""
echo "=== DL18: Summary 404 Suppressed ==="
warn_404=$(docker compose logs dashboard 2>&1 | grep "API client error" | grep "/summary" | wc -l)
debug_404=$(docker compose logs dashboard 2>&1 | grep "API call not found" | wc -l)
echo "Summary 404 as WARN: $warn_404 (should be 0)"
echo "Summary 404 as DEBUG (suppressed): $debug_404 (should be > 0 for new runs)"
```

### Acceptance Criteria — Task 9
- [ ] All 20 functional checks pass
- [ ] All 20 logging checks (DL1-DL20) pass
- [ ] Verify script runs without errors
- [ ] Password NEVER appears in any log
- [ ] Persistence works (close browser → reopen → data preserved)
- [ ] Running test survives browser close

---

## Logging Reference — Task → Module → Log Points

> **Quan trọng**: Mỗi task khi implement PHẢI tham chiếu bảng log points trong phần tương ứng.
> Không implement logging "tự do" — phải đúng event name, đúng fields, đúng level.

### Mapping tổng quan

| Task | Module(s) cần implement log | Log count |
|------|----------------------------|-----------|
| Task 1 | `lib/logger` startup (1), `app/error.tsx` global error boundary (1) | 2 |
| Task 2 | `lib/api-client` (10 — thêm #10 suppressed 404), `hooks/usePolling` (6) | 16 |
| Task 3 | `pages/providers` (6 server + 1 client validation) | 7 |
| Task 4 | `pages/proxies` (6 server + 1 client validation) | 7 |
| Task 5 | `pages/test` (5 server + 1 client validation) | 6 |
| Task 6 | (uses existing hooks, no new logs) | 0 |
| Task 7 | `pages/runs` (2 server + 6 client: status, summary, polling, partial fetch) | 8 |
| Task 8 | (uses existing hooks, no new logs) | 0 |
| Task 9 | (verify all logs) | 0 |
| **Global** | Page error per-page (3: providers, runs list, overview) | 3 |
| **Tổng** | — | **49** |

### Tổng kết Logging — 49 log points

| Module | Server (pino) | Client (console) | Tổng |
|--------|--------------|------------------|------|
| Startup | 1 | 0 | 1 |
| api-client | 10 | 0 | 10 |
| Provider page | 6 | 1 | 7 |
| Proxy page | 6 | 1 | 7 |
| Start Test | 5 | 1 | 6 |
| Run Detail/Stop | 2 | 6 | 8 |
| usePolling | 0 | 6 | 6 |
| Page error (global + per-page) | 4 | 0 | 4 |
| **Tổng** | **34** | **15** | **49** |

> **Thay đổi từ 41 → 49**: Thêm 8 log points mới:
> - +1: Dashboard started (startup)
> - +1: API call not found (suppressed) — 404 on summary/samples returns null instead of WARN
> - +1: Provider form validation (client)
> - +1: Test config form validation (client)
> - +2: Partial fetch failure (run summary, run samples) — client console
> - +1: Global error boundary
> - +2: Per-page error logs (providers, overview) — runs list đã có qua error state, run detail đã có

### Quy tắc chung

1. **Server-side**: dùng `pino` với `{ service: "dashboard", module: "..." }`
2. **Client-side**: dùng `console.*` wrapped trong `process.env.NODE_ENV === 'development'`
3. **Password**: KHÔNG BAO GIỜ log password value. Chỉ log `password_changed: true/false`
4. **Error logs**: luôn có `error_detail` field
5. **Success logs**: luôn có liên quan IDs (provider_id, proxy_id, run_id)
6. **404 on summary/samples**: Dùng `suppressNotFound: true` → log DEBUG thay vì WARN, tránh log spam khi polling new runs

---

## Files tổng cộng (~35 files)

```
dashboard/
├── package.json                               ← Task 1
├── tsconfig.json                              ← Task 1
├── next.config.js                             ← Task 1
├── tailwind.config.ts                         ← Task 1
├── postcss.config.js                          ← Task 1
├── Dockerfile                                 ← Task 1
├── .env.local.example                         ← Task 1
├── public/
│   └── favicon.ico                            ← Task 1
└── src/
    ├── app/
    │   ├── layout.tsx                         ← Task 1
    │   ├── globals.css                        ← Task 1
    │   ├── error.tsx                          ← Task 1 (global error boundary)
    │   ├── page.tsx                           ← Task 8 (placeholder → Task 1)
    │   ├── providers/
    │   │   └── page.tsx                       ← Task 3
    │   └── runs/
    │       ├── page.tsx                       ← Task 6
    │       └── [runId]/
    │           └── page.tsx                   ← Task 7
    ├── components/
    │   ├── layout/
    │   │   └── Sidebar.tsx                    ← Task 1
    │   ├── ui/
    │   │   ├── Button.tsx                     ← Task 1
    │   │   ├── Badge.tsx                      ← Task 1
    │   │   ├── Card.tsx                       ← Task 1
    │   │   ├── Input.tsx                      ← Task 1
    │   │   ├── Select.tsx                     ← Task 1
    │   │   ├── Table.tsx                      ← Task 1
    │   │   ├── LoadingSpinner.tsx             ← Task 1
    │   │   ├── ErrorAlert.tsx                 ← Task 1
    │   │   ├── EmptyState.tsx                 ← Task 1
    │   │   ├── Modal.tsx                      ← Task 1
    │   │   └── ConfirmDialog.tsx              ← Task 1
    │   ├── providers/
    │   │   ├── ProviderList.tsx               ← Task 3
    │   │   ├── ProviderForm.tsx               ← Task 3
    │   │   └── DeleteProviderDialog.tsx       ← Task 3
    │   ├── proxies/
    │   │   ├── ProxyList.tsx                  ← Task 4
    │   │   ├── ProxyForm.tsx                  ← Task 4
    │   │   ├── ProxyCard.tsx                  ← Task 4
    │   │   └── DeleteProxyDialog.tsx          ← Task 4
    │   ├── test/
    │   │   ├── ProxySelector.tsx              ← Task 5
    │   │   ├── TestConfigForm.tsx             ← Task 5
    │   │   └── StartTestDialog.tsx            ← Task 5
    │   ├── runs/
    │   │   ├── RunsList.tsx                   ← Task 6
    │   │   ├── RunsFilter.tsx                 ← Task 6
    │   │   ├── RunStatusBadge.tsx             ← Task 6
    │   │   ├── RunHeader.tsx                  ← Task 7
    │   │   ├── RunSummaryCards.tsx             ← Task 7
    │   │   ├── RunMetricsDetail.tsx            ← Task 7
    │   │   ├── RunHttpSamples.tsx              ← Task 7
    │   │   └── StopTestButton.tsx              ← Task 7
    │   └── overview/
    │       ├── StatCards.tsx                    ← Task 8
    │       ├── ActiveRunsList.tsx               ← Task 8
    │       └── RecentResultsList.tsx            ← Task 8
    ├── hooks/
    │   ├── usePolling.ts                       ← Task 2
    │   ├── useProviders.ts                     ← Task 2
    │   ├── useProxies.ts                       ← Task 2
    │   ├── useRuns.ts                          ← Task 2
    │   └── useRunDetail.ts                     ← Task 2
    ├── lib/
    │   ├── api-client.ts                       ← Task 2
    │   └── logger.ts                           ← Task 1
    └── types/
        └── index.ts                            ← Task 2
```

---

## KHÔNG làm trong Sprint 2 (deferred)

| Feature | Sprint | Ghi chú Sprint 2 |
|---------|--------|-------------------|
| WebSocket test UI | Sprint 3 | Chưa có WS data — Sprint 3 implement WS tester |
| IP check display | Sprint 3 | Chưa có IP check data |
| Multi-proxy comparison | Sprint 4 | Sprint 2 xem từng run riêng |
| Charts (line, bar, pie) | Sprint 4 | Sprint 2 chỉ có numbers + tables |
| Export (CSV, PDF) | Sprint 4 | Chưa implement |
| Batch import (YAML/CSV) | Sprint 4 | Sprint 2 manual input only |
| Authentication / multi-user | Ngoài scope | Local-only tool, single user |
| SSE / WebSocket realtime | Ngoài scope | Polling 3-5s đủ cho 10 proxies |

---

## Node.js Dependencies (Sprint 2 — Dashboard)

```
next                    # React framework (14+, App Router)
react                   # UI library
react-dom               # DOM rendering
pino                    # Structured JSON logging (server-side)
```

**Dev dependencies**:
```
@types/node             # Node.js types
@types/react            # React types
@types/react-dom        # ReactDOM types
autoprefixer            # PostCSS plugin
postcss                 # CSS preprocessor
tailwindcss             # Utility CSS framework
typescript              # Type checking
```

> **Lưu ý**: Không dùng state management library (Redux, Zustand, etc.) — React hooks đủ cho scope Sprint 2.
> Không dùng form library (React Hook Form, Formik) — inline validation đủ đơn giản.
> Không dùng data fetching library (React Query, SWR) — custom usePolling + useState đủ rõ ràng.
