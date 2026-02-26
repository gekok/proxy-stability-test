# Sprint 4 — Advanced Dashboard + Export (Chi tiết)

> **Mục tiêu Sprint 4**: Hoàn thiện Dashboard UI — charts chi tiết (Latency, Uptime, Score), trang so sánh providers (radar chart), export JSON/CSV, xem log lỗi chi tiết per run. Sprint 4 là sprint cuối cùng, hoàn thành toàn bộ hệ thống.

| Field | Value |
|-------|-------|
| Sprint | 4 / 4 |
| Thời gian | Week 7-8 |
| Input | Sprint 3 hoàn thành: Full pipeline HTTP+HTTPS+WS+IP, test song song 10 proxies, scoring 5 tiêu chí, 54 log points |
| Output | UI hoàn chỉnh với charts + so sánh providers + export JSON/CSV + error log viewer |

---

## Tổng quan Tasks (theo thứ tự dependency)

```
Task 1: Chart Library Setup + Shared Utilities     ←── independent
  ├── Task 2 (LatencyChart + UptimeTimeline)        ← depends on 1
  ├── Task 3 (ScoreGauge + Score History)            ← depends on 1
  │
Task 4: Controller API — Export + Compare           ←── independent
  ├── Task 5 (Comparison Page)                       ← depends on 1, 4
  ├── Task 6 (Export Download)                       ← depends on 4
  │
Task 7: Error Log Viewer                            ←── independent
  │
Task 8: E2E Integration Test                        ← depends on 2, 3, 5, 6, 7
```

> Task 1, Task 4, Task 7 có thể làm **song song** vì không phụ thuộc nhau.
> Task 5 phụ thuộc cả Task 1 (chart components) và Task 4 (compare API).
> Task 8 (E2E test) phải chờ tất cả tasks khác hoàn thành.

### 8 Tasks tổng quan

| # | Task | Mô tả | Files mới | Files sửa |
|---|------|-------|-----------|-----------|
| 1 | Chart Library Setup + Shared Utilities | Install recharts, ChartContainer, ChartTooltip, chart-utils, ChartErrorBoundary | 4 new | 1 modify |
| 2 | LatencyChart + UptimeTimeline | Line chart P50/P95/P99, area chart uptime/errors, useChartData hook | 3 new | 2 modify |
| 3 | ScoreGauge + Score History | Radial gauge score+grade, score-over-time line, useSummaryHistory hook | 3 new | 2 modify |
| 4 | Controller API — Export + Compare | GET /runs/:id/export (JSON/CSV), GET /providers/compare, exportService | 2 new | 3 modify |
| 5 | Comparison Page (Radar Chart) | /compare page, ProviderSelect, RadarCompareChart, ComparisonTable, useCompare | 5 new | 2 modify |
| 6 | Export Feature (Download) | ExportButton dropdown, useExport blob download | 2 new | 3 modify |
| 7 | Error Log Viewer | ErrorLogViewer, ErrorLogFilters, useErrorLogs, unified ErrorLogEntry type | 3 new | 2 modify |
| 8 | E2E Integration Test | 10-step scenario, 20 functional checks, DL1-DL12 logging checks | 0 new | 0 modify |

### Thay đổi so với Sprint 3 (upgrade Dashboard)

| Module | Sprint 3 Status | Sprint 4 Upgrade |
|--------|-----------------|------------------|
| Dashboard Run Detail | Số liệu + bảng (6 cards, 4 tabs) | +Charts tab (latency, uptime, score gauge, score history) |
| Dashboard Run Detail | Chỉ thấy error_count | +Errors tab (expandable error list, filters) |
| Dashboard Run Detail | Không export | +ExportButton (JSON/CSV download) |
| Dashboard Navigation | 3 pages (Overview, Providers, Runs) | +Compare page (radar chart so sánh providers) |
| API Endpoints | CRUD + batch + summary | +Export endpoint + Compare endpoint |
| npm Dependencies | Next.js, Tailwind, pino | +recharts |

### npm Dependency mới

```
recharts    # React charting library (built on D3)
```

> **Tại sao recharts?** Thư viện charting phổ biến nhất cho React, built on D3.js, declarative API, responsive, TypeScript support. Hỗ trợ tất cả chart types cần thiết: LineChart, AreaChart, RadarChart, RadialBarChart.

### Client-side Logging Convention (Sprint 4)

Sprint 4 client logs (Dashboard — browser console) **PHẢI** include `module` field để filter dễ dàng. Convention:

- **Server-side (API Node.js)**: dùng `pino` logger → `logger.info({ module: 'routes.export', ... }, 'message')`
- **Client-side (Dashboard Next.js)**: dùng `console.debug/warn/error` → `console.debug('message', { module: 'charts.latency', ... })`

**clientLog() helper pattern** (optional, dùng cho consistency):

```typescript
// dashboard/src/lib/client-log.ts
function clientLog(level: 'debug' | 'warn' | 'error', message: string, data: Record<string, any>) {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'development') return;
  console[level](message, { ...data, _ts: new Date().toISOString() });
}
```

> Sprint 2 đã thiết lập convention: pino cho server, console.* cho client. Sprint 4 tiếp tục convention này, thêm `module` field bắt buộc cho mọi client log entry.

---

## Task 1: Chart Library Setup + Shared Utilities

### Mục tiêu
Install recharts, tạo shared chart components (ChartContainer responsive wrapper, ChartTooltip custom tooltip) và chart utility functions. Foundation cho tất cả charts trong Sprint 4.

### Files tạo mới

```
dashboard/
├── src/
│   └── components/
│       └── charts/
│           ├── ChartContainer.tsx      ← NEW — responsive wrapper + loading/empty states
│           ├── ChartTooltip.tsx        ← NEW — custom tooltip component
│           ├── ChartErrorBoundary.tsx  ← NEW — error boundary for chart render errors
│           └── chart-utils.ts          ← NEW — colors, formatters, helpers
└── package.json                        ← MODIFY — add recharts dependency
```

### 1.1 Package Installation

```bash
cd dashboard && npm install recharts
```

package.json thêm:
```json
{
  "dependencies": {
    "recharts": "^2.12.0"
  }
}
```

### 1.2 ChartContainer — Responsive Wrapper

```tsx
// dashboard/src/components/charts/ChartContainer.tsx
'use client';

import { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

interface ChartContainerProps {
  title: string;
  children: ReactNode;
  height?: number;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
}

export function ChartContainer({
  title,
  children,
  height = 300,
  loading = false,
  empty = false,
  emptyMessage = 'No data available',
}: ChartContainerProps) {
  // Log empty state for debugging — helps identify data pipeline issues
  if (empty && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.warn('Chart empty data', {
      module: 'charts.container',
      chart_title: title,
      empty_message: emptyMessage,
    });
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>

      {loading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : empty ? (
        <div className="flex items-center justify-center text-gray-400 text-sm" style={{ height }}>
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {children as any}
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

> **3 states**: loading (spinner), empty (message), data (chart). Mọi chart trong Sprint 4 đều wrap trong ChartContainer — đảm bảo consistent loading/empty UX.

### 1.3 ChartTooltip — Custom Tooltip

```tsx
// dashboard/src/components/charts/ChartTooltip.tsx
'use client';

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  unit?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  formatter?: (value: number, name: string) => string;
}

export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-mono font-medium">
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
```

### 1.4 chart-utils.ts — Colors, Formatters, Helpers

```typescript
// dashboard/src/components/charts/chart-utils.ts

// Chart color palette
export const CHART_COLORS = {
  p50: '#3B82F6',       // blue-500
  p95: '#F59E0B',       // amber-500
  p99: '#EF4444',       // red-500
  success: '#10B981',   // emerald-500
  error: '#EF4444',     // red-500
  uptime: '#6366F1',    // indigo-500
  ws: '#8B5CF6',        // violet-500
  security: '#EC4899',  // pink-500
  jitter: '#F97316',    // orange-500
  latency: '#06B6D4',   // cyan-500
} as const;

export const SCORE_COMPONENT_LABELS: Record<string, string> = {
  score_uptime: 'Uptime',
  score_latency: 'Latency',
  score_jitter: 'Jitter',
  score_ws: 'WebSocket',
  score_security: 'Security',
};

export const SCORE_COMPONENT_COLORS: Record<string, string> = {
  score_uptime: CHART_COLORS.success,
  score_latency: CHART_COLORS.latency,
  score_jitter: CHART_COLORS.jitter,
  score_ws: CHART_COLORS.ws,
  score_security: CHART_COLORS.security,
};

export const PROVIDER_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];

// Formatters
export function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return '#10B981';
    case 'B': return '#3B82F6';
    case 'C': return '#F59E0B';
    case 'D': return '#F97316';
    case 'F': return '#EF4444';
    default:  return '#6B7280';
  }
}

export function scoreColor(score: number): string {
  if (score >= 0.90) return gradeColor('A');
  if (score >= 0.75) return gradeColor('B');
  if (score >= 0.60) return gradeColor('C');
  if (score >= 0.40) return gradeColor('D');
  return gradeColor('F');
}

// Time bucket helper for chart data aggregation
export function bucketByTime<T extends { measured_at?: string }>(
  items: T[],
  bucketSizeMs: number = 60000,
): Map<number, T[]> {
  const buckets = new Map<number, T[]>();
  for (const item of items) {
    if (!item.measured_at) continue;
    const ts = new Date(item.measured_at).getTime();
    const bucketKey = Math.floor(ts / bucketSizeMs) * bucketSizeMs;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(item);
  }
  return buckets;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}
```

### 1.5 ChartErrorBoundary — React Error Boundary

```tsx
// dashboard/src/components/charts/ChartErrorBoundary.tsx
'use client';

import { Component, ReactNode, ErrorInfo } from 'react';

interface ChartErrorBoundaryProps {
  chartType: string;
  children: ReactNode;
}

interface ChartErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  constructor(props: ChartErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.error('Chart render error', {
        module: 'charts.' + this.props.chartType,
        chart_type: this.props.chartType,
        error_detail: error.message,
        component_stack: errorInfo.componentStack?.slice(0, 200),
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-600 text-sm font-medium">Chart render error</p>
          <p className="text-red-400 text-xs mt-1">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

> **ChartErrorBoundary** wraps tất cả chart components. Khi recharts hoặc data transformation throw error, boundary catches → logs `console.error('Chart render error', ...)` → hiển thị error UI thay vì crash toàn page. Đây là component thực hiện các "Chart render error" events được liệt kê trong Tasks 2+3 logging tables.

### 1.6 Logging (1 event)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `charts.container` (client) | Chart empty data | console.warn | `chart_title`, `empty_message` |

> ChartErrorBoundary log (`Chart render error`) được đếm ở Tasks 2+3 vì nó fire per-chart-type. ChartContainer empty WARN giúp detect data pipeline issues (API trả data nhưng charts vẫn empty).

### Acceptance Criteria — Task 1
- [ ] `recharts` installed trong dashboard/package.json
- [ ] `npm run build` thành công (no TypeScript errors)
- [ ] ChartContainer renders loading spinner khi `loading=true`
- [ ] ChartContainer renders empty message khi `empty=true`
- [ ] ChartContainer logs `console.warn('Chart empty data', ...)` khi `empty=true`
- [ ] ChartContainer wraps children trong ResponsiveContainer
- [ ] ChartTooltip displays payload với colors
- [ ] ChartErrorBoundary catches render errors → hiển thị error UI + logs `console.error('Chart render error', ...)`
- [ ] ChartErrorBoundary Retry button resets error state
- [ ] chart-utils exports: CHART_COLORS, formatMs, formatPercent, gradeColor, scoreColor, bucketByTime, percentile
- [ ] SCORE_COMPONENT_LABELS có đủ 5 keys

---

## Task 2: LatencyChart + UptimeTimeline

### Mục tiêu
Tạo useChartData hook (aggregation http_samples -> time-bucketed data points), LatencyChart (recharts LineChart với 3 lines P50/P95/P99 theo thời gian), UptimeTimeline (recharts AreaChart stacked success+error với secondary uptime_ratio line).

### Files tạo/sửa

```
dashboard/src/
├── hooks/
│   └── useChartData.ts                 ← NEW — aggregate samples -> chart data
├── components/
│   └── charts/
│       ├── LatencyChart.tsx            ← NEW — line chart P50/P95/P99
│       └── UptimeTimeline.tsx          ← NEW — area chart success/error + uptime line
├── types/
│   └── index.ts                        ← MODIFY — add chart data types
└── app/
    └── runs/
        └── [runId]/
            └── page.tsx                ← MODIFY — add Charts tab
```

### 2.1 Chart Data Types

```typescript
// dashboard/src/types/index.ts — Sprint 4 additions

interface LatencyDataPoint {
  time: string;        // formatted time label
  timestamp: number;   // epoch ms (bucket start)
  p50: number;         // TTFB P50 in ms
  p95: number;         // TTFB P95 in ms
  p99: number;         // TTFB P99 in ms
  sample_count: number;
}

interface UptimeDataPoint {
  time: string;
  timestamp: number;
  success_count: number;
  error_count: number;
  uptime_ratio: number; // 0.0 - 1.0
  total: number;
}
```

### 2.2 useChartData Hook

```typescript
// dashboard/src/hooks/useChartData.ts
'use client';

import { useMemo } from 'react';
import { bucketByTime, percentile } from '@/components/charts/chart-utils';

interface HttpSample {
  measured_at?: string;
  ttfb_ms?: number;
  status_code?: number;
  error_type?: string;
  is_warmup?: boolean;
}

export function useChartData(samples: HttpSample[], bucketSizeMs = 60000) {
  const latencyData = useMemo(() => {
    try {
      const validSamples = samples.filter(s => !s.is_warmup && s.ttfb_ms != null && s.ttfb_ms > 0);
      const buckets = bucketByTime(validSamples, bucketSizeMs);

      return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([ts, items]) => {
          const ttfbs = items.map(s => s.ttfb_ms!).sort((a, b) => a - b);
          return {
            time: new Date(ts).toLocaleTimeString(),
            timestamp: ts,
            p50: percentile(ttfbs, 0.50),
            p95: percentile(ttfbs, 0.95),
            p99: percentile(ttfbs, 0.99),
            sample_count: ttfbs.length,
          };
        });
    } catch (err: any) {
      console.error('Chart data aggregation failed', {
        module: 'charts.data',
        hook: 'useChartData',
        fn_name: 'latencyData',
        error: err.message,
      });
      return [];
    }
  }, [samples, bucketSizeMs]);

  const uptimeData = useMemo(() => {
    try {
      const validSamples = samples.filter(s => !s.is_warmup);
      const buckets = bucketByTime(validSamples, bucketSizeMs);

      return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([ts, items]) => {
          const successCount = items.filter(s => s.status_code && s.status_code >= 200 && s.status_code < 400).length;
          const errorCount = items.filter(s => s.error_type || (s.status_code && s.status_code >= 400)).length;
          const total = successCount + errorCount;
          return {
            time: new Date(ts).toLocaleTimeString(),
            timestamp: ts,
            success_count: successCount,
            error_count: errorCount,
            uptime_ratio: total > 0 ? successCount / total : 1,
            total,
          };
        });
    } catch (err: any) {
      console.error('Chart data aggregation failed', {
        module: 'charts.data',
        hook: 'useChartData',
        fn_name: 'uptimeData',
        error: err.message,
      });
      return [];
    }
  }, [samples, bucketSizeMs]);

  return { latencyData, uptimeData };
}
```

> **Bucket aggregation**: Samples group theo 1-minute windows. Mỗi bucket tính P50/P95/P99 riêng. Warmup samples excluded.

### 2.3 LatencyChart — P50/P95/P99 Line Chart

```tsx
// dashboard/src/components/charts/LatencyChart.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartContainer } from './ChartContainer';
import { ChartTooltip } from './ChartTooltip';
import { CHART_COLORS, formatMs } from './chart-utils';

interface LatencyChartProps {
  data: LatencyDataPoint[];
  loading?: boolean;
}

export function LatencyChart({ data, loading }: LatencyChartProps) {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && data.length > 0) {
    console.debug('Latency chart rendered', {
      module: 'charts.latency',
      data_points: data.length,
      latest_p95: data[data.length - 1]?.p95,
    });
  }

  return (
    <ChartContainer title="Latency Over Time (TTFB)" loading={loading} empty={data.length === 0} emptyMessage="No latency data yet" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => formatMs(v)} tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTooltip formatter={(v) => formatMs(v)} />} />
        <Legend />
        <Line type="monotone" dataKey="p50" name="P50" stroke={CHART_COLORS.p50} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p95" name="P95" stroke={CHART_COLORS.p95} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p99" name="P99" stroke={CHART_COLORS.p99} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
```

### 2.4 UptimeTimeline — Stacked Area Chart

```tsx
// dashboard/src/components/charts/UptimeTimeline.tsx
'use client';

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartContainer } from './ChartContainer';
import { ChartTooltip } from './ChartTooltip';
import { CHART_COLORS, formatPercent } from './chart-utils';

interface UptimeTimelineProps {
  data: UptimeDataPoint[];
  loading?: boolean;
}

export function UptimeTimeline({ data, loading }: UptimeTimelineProps) {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && data.length > 0) {
    console.debug('Uptime chart rendered', {
      module: 'charts.uptime',
      data_points: data.length,
      latest_uptime: data[data.length - 1]?.uptime_ratio,
    });
  }

  return (
    <ChartContainer title="Uptime Timeline" loading={loading} empty={data.length === 0} emptyMessage="No uptime data yet" height={300}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="ratio" orientation="right" tickFormatter={(v) => formatPercent(v)} tick={{ fontSize: 12 }} domain={[0, 1]} />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        <Area yAxisId="count" type="monotone" dataKey="success_count" name="Success" stackId="1" fill={CHART_COLORS.success} stroke={CHART_COLORS.success} fillOpacity={0.6} />
        <Area yAxisId="count" type="monotone" dataKey="error_count" name="Errors" stackId="1" fill={CHART_COLORS.error} stroke={CHART_COLORS.error} fillOpacity={0.6} />
        <Line yAxisId="ratio" type="monotone" dataKey="uptime_ratio" name="Uptime %" stroke={CHART_COLORS.uptime} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
```

### 2.5 Integration — Charts Tab in Run Detail

```tsx
// dashboard/src/app/runs/[runId]/page.tsx — add Charts tab
const tabs = [
  { id: 'http',   label: 'HTTP Samples',    component: <HttpSamples runId={runId} /> },
  { id: 'ws',     label: 'WS Connections',   component: <RunWSSamples runId={runId} /> },
  { id: 'ip',     label: 'IP Check',         component: <RunIPCheck runId={runId} /> },
  { id: 'score',  label: 'Score Breakdown',  component: <RunScoreBreakdown summary={summary} /> },
  { id: 'charts', label: 'Charts',           component: <RunCharts runId={runId} samples={samples} /> },
];
```

**RunCharts — ChartErrorBoundary wrapping pattern**:

```tsx
// dashboard/src/components/runs/RunCharts.tsx (excerpt)
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { LatencyChart } from '@/components/charts/LatencyChart';
import { UptimeTimeline } from '@/components/charts/UptimeTimeline';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { ScoreHistoryChart } from '@/components/charts/ScoreHistoryChart';

// Inside RunCharts render:
<ChartErrorBoundary chartType="latency">
  <LatencyChart data={latencyData} />
</ChartErrorBoundary>
<ChartErrorBoundary chartType="uptime">
  <UptimeTimeline data={uptimeData} />
</ChartErrorBoundary>
<ChartErrorBoundary chartType="score_gauge">
  <ScoreGauge score={summary.score_total} grade={summary.grade} />
</ChartErrorBoundary>
<ChartErrorBoundary chartType="score_history">
  <ScoreHistoryChart data={historyData} />
</ChartErrorBoundary>
```

### 2.6 Logging (4 events — client)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `charts.latency` (client) | Latency chart rendered | console.debug | `data_points`, `latest_p95` |
| 2 | `charts.uptime` (client) | Uptime chart rendered | console.debug | `data_points`, `latest_uptime` |
| 3 | `charts.latency` (client) | Chart render error | console.error | `error_detail`, `chart_type: "latency"` |
| 4 | `charts.data` (client) | Chart data aggregation failed | console.error | `hook: "useChartData"`, `fn_name`, `error` |

### Acceptance Criteria — Task 2
- [ ] LatencyChart renders 3 lines (P50 xanh, P95 vàng, P99 đỏ)
- [ ] X axis = time, Y axis = ms with formatMs
- [ ] UptimeTimeline renders stacked area (green success, red error)
- [ ] Secondary Y axis shows uptime_ratio as percentage
- [ ] useChartData aggregates samples into 1-minute buckets
- [ ] Warmup samples filtered out
- [ ] Charts tab visible in Run Detail page
- [ ] Loading/empty states work correctly
- [ ] Tooltip shows formatted values on hover

---

## Task 3: ScoreGauge + Score History

### Mục tiêu
Tạo ScoreGauge (RadialBarChart hiển thị score tổng + grade, color by grade), ScoreHistoryChart (LineChart score_total over time with grade threshold bands), useSummaryHistory hook (accumulate polling responses, sliding window 200 points).

### Files tạo/sửa

```
dashboard/src/
├── hooks/
│   └── useSummaryHistory.ts            ← NEW — accumulate summary snapshots
├── components/
│   └── charts/
│       ├── ScoreGauge.tsx              ← NEW — radial gauge score + grade
│       └── ScoreHistoryChart.tsx       ← NEW — score over time line chart
├── types/
│   └── index.ts                        ← MODIFY — add SummarySnapshot type
└── app/
    └── runs/
        └── [runId]/
            └── page.tsx                ← MODIFY — add gauge + history to Charts tab
```

### 3.1 SummarySnapshot Type

```typescript
// dashboard/src/types/index.ts — Sprint 4 additions
interface SummarySnapshot {
  timestamp: number;
  time: string;
  score_total: number;
  grade: string;
  score_uptime: number;
  score_latency: number;
  score_jitter: number;
  score_ws?: number;
  score_security?: number;
  uptime_ratio: number;
}
```

### 3.2 useSummaryHistory Hook

```typescript
// dashboard/src/hooks/useSummaryHistory.ts
'use client';

import { useRef, useMemo } from 'react';

const MAX_HISTORY = 200;

export function useSummaryHistory(summary: RunSummary | null) {
  const historyRef = useRef<SummarySnapshot[]>([]);

  useMemo(() => {
    if (!summary?.score_total) return;

    const now = Date.now();
    const last = historyRef.current[historyRef.current.length - 1];

    // Avoid duplicate if same score at same second
    if (last && Math.abs(last.timestamp - now) < 5000 && last.score_total === summary.score_total) {
      return;
    }

    historyRef.current.push({
      timestamp: now,
      time: new Date(now).toLocaleTimeString(),
      score_total: summary.score_total,
      grade: summary.grade ?? '--',
      score_uptime: summary.score_uptime ?? 0,
      score_latency: summary.score_latency ?? 0,
      score_jitter: summary.score_jitter ?? 0,
      score_ws: summary.score_ws,
      score_security: summary.score_security,
      uptime_ratio: summary.uptime_ratio ?? 0,
    });

    // Sliding window
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(-MAX_HISTORY);
    }

    // Client log: Score history snapshot
    if (process.env.NODE_ENV === 'development') {
      console.debug('Score history snapshot', {
        module: 'charts.score_history',
        history_length: historyRef.current.length,
        latest_score: summary.score_total,
        latest_grade: summary.grade,
      });
    }
  }, [summary?.score_total, summary?.computed_at]);

  return historyRef.current;
}
```

> **Sliding window 200 points**: Mỗi 30s Runner gửi summary mới -> Dashboard nhận -> hook ghi nhớ (tối đa 200). Tránh memory leak cho long-running tests. 200 points x 30s = ~100 phút history.

### 3.3 ScoreGauge — Radial Bar Chart

```
Display:
      ╭──────────╮
    /   ████████   \
   |    ████████    |
   |                |
   |      85        |     ← score center text
   |       B        |     ← grade center text
   |                |
    \              /
      ╰──────────╯
```

```tsx
// dashboard/src/components/charts/ScoreGauge.tsx
'use client';

import { RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { gradeColor, scoreColor } from './chart-utils';

interface ScoreGaugeProps {
  score: number;    // 0.0 - 1.0
  grade: string;    // A/B/C/D/F
  size?: number;
}

export function ScoreGauge({ score, grade, size = 200 }: ScoreGaugeProps) {
  const percentage = Math.round(score * 100);
  const color = scoreColor(score);

  const data = [{ name: 'score', value: percentage, fill: color }];

  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.debug('Score gauge rendered', {
      module: 'charts.score_gauge',
      score,
      grade,
      color,
    });
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <RadialBarChart
        width={size}
        height={size}
        cx={size / 2}
        cy={size / 2}
        innerRadius={size * 0.35}
        outerRadius={size * 0.45}
        barSize={12}
        data={data}
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
        <RadialBar background={{ fill: '#f3f4f6' }} dataKey="value" angleAxisId={0} cornerRadius={6} />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{percentage}</span>
        <span className="text-lg font-semibold" style={{ color: gradeColor(grade) }}>{grade}</span>
      </div>
    </div>
  );
}
```

### 3.4 ScoreHistoryChart — Score Over Time

```tsx
// dashboard/src/components/charts/ScoreHistoryChart.tsx
'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea } from 'recharts';
import { ChartContainer } from './ChartContainer';
import { ChartTooltip } from './ChartTooltip';
import { CHART_COLORS, gradeColor } from './chart-utils';

interface ScoreHistoryChartProps {
  data: SummarySnapshot[];
  loading?: boolean;
}

export function ScoreHistoryChart({ data, loading }: ScoreHistoryChartProps) {
  return (
    <ChartContainer title="Score Over Time" loading={loading} empty={data.length < 2} emptyMessage="Need at least 2 data points" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        {/* Grade threshold bands */}
        <ReferenceArea y1={0.9} y2={1.0} fill={gradeColor('A')} fillOpacity={0.08} />
        <ReferenceArea y1={0.75} y2={0.9} fill={gradeColor('B')} fillOpacity={0.08} />
        <ReferenceArea y1={0.6} y2={0.75} fill={gradeColor('C')} fillOpacity={0.08} />
        <ReferenceArea y1={0.4} y2={0.6} fill={gradeColor('D')} fillOpacity={0.08} />
        <ReferenceArea y1={0} y2={0.4} fill={gradeColor('F')} fillOpacity={0.08} />
        <XAxis dataKey="time" tick={{ fontSize: 12 }} />
        <YAxis domain={[0, 1]} tickFormatter={(v) => v.toFixed(1)} tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(3)} />} />
        <Legend />
        <Line type="monotone" dataKey="score_total" name="Total Score" stroke={CHART_COLORS.p50} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
```

> **Grade bands**: Background colors hiện A (xanh), B (xanh dương), C (vàng), D (cam), F (đỏ) zones — dễ nhìn score đang ở grade nào.

### 3.5 Logging (3 events — client)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `charts.score_gauge` (client) | Score gauge rendered | console.debug | `score`, `grade`, `color` |
| 2 | `charts.score_history` (client) | Score history snapshot | console.debug | `history_length`, `latest_score`, `latest_grade` |
| 3 | `charts.score_history` (client) | Chart render error | console.error | `error_detail`, `chart_type: "score_history"` |

### Acceptance Criteria — Task 3
- [ ] ScoreGauge displays radial progress arc with center score + grade
- [ ] Color changes by grade (A=emerald, B=blue, C=amber, D=orange, F=red)
- [ ] ScoreHistoryChart shows score_total line over time
- [ ] Grade threshold bands visible (A/B/C/D/F background colors)
- [ ] useSummaryHistory accumulates snapshots (max 200, sliding window)
- [ ] Duplicate scores within 5s not added to history
- [ ] Charts tab shows ScoreGauge + ScoreHistoryChart

---

## Task 4: Controller API — Export + Compare

### Mục tiêu
Implement 2 new API endpoints: GET /runs/:id/export (JSON + CSV export with Content-Disposition header), GET /providers/compare (aggregated comparison data across providers). Tạo exportService cho data transformation.

### Files tạo/sửa

```
api/src/
├── routes/
│   └── export.ts                       ← NEW — export + compare endpoints
├── services/
│   └── exportService.ts                ← NEW — data transformation + CSV generation
├── routes/
│   └── index.ts                        ← MODIFY — register export routes
├── services/
│   └── runService.ts                   ← MODIFY — add comparison queries
└── types/
    └── index.ts                        ← MODIFY — add RunExport, ProviderComparison types
```

### 4.1 Export Types

```typescript
// api/src/types/index.ts — Sprint 4 additions

interface RunExport {
  meta: {
    run_id: string;
    proxy_label: string;
    provider_name: string;
    status: string;
    started_at: string;
    stopped_at?: string;
    duration_ms?: number;
    exported_at: string;
    format: 'json' | 'csv';
  };
  summary: RunSummary;
  scoring: {
    score_total: number;
    grade: string;
    components: {
      uptime: { score: number; weight: 0.25 };
      latency: { score: number; weight: 0.25 };
      jitter: { score: number; weight: 0.15 };
      ws: { score: number; weight: 0.15 };
      security: { score: number; weight: 0.20 };
    };
  };
  http_samples: HttpSample[];
  ws_samples: WSSample[];
  ip_checks: IPCheckResult[];
}

interface ProviderComparison {
  provider_id: string;
  provider_name: string;
  proxy_count: number;
  total_runs: number;
  avg_score_total: number;
  avg_score_uptime: number;
  avg_score_latency: number;
  avg_score_jitter: number;
  avg_score_ws: number;
  avg_score_security: number;
  avg_uptime_ratio: number;
  avg_ttfb_p95_ms: number;
  avg_ws_rtt_ms: number;
  ip_clean_ratio: number;
  geo_match_ratio: number;
  best_grade: string;
  avg_grade: string;
}
```

### 4.2 Export Endpoint

**Data flow**:
```
GET /runs/:id/export?format=json
  -> exportService.generateJSON(runId)
  -> Query: test_run + proxy_endpoint + provider (JOIN)
  -> Query: run_summary
  -> Query: http_sample (all, ordered by seq)
  -> Query: ws_sample (all, ordered by seq)
  -> Query: ip_check_result (all)
  -> Build RunExport object
  -> Content-Disposition: attachment; filename="run-abc12345.json"
  -> Response JSON

GET /runs/:id/export?format=csv
  -> exportService.generateCSV(runId)
  -> Query: http_sample (non-warmup only)
  -> Flatten to CSV rows (headers + data)
  -> Content-Disposition: attachment; filename="run-abc12345.csv"
  -> Response text/csv
```

```typescript
// api/src/routes/export.ts
import { Router } from 'express';
import { logger } from '../logger';
import { exportService } from '../services/exportService';

const router = Router();
const MODULE = 'routes.export';

// GET /api/v1/runs/:id/export?format=json|csv
router.get('/runs/:id/export', async (req, res) => {
  const runId = req.params.id;
  const format = (req.query.format as string) || 'json';

  logger.info({ module: MODULE, run_id: runId, format }, 'Export requested');

  try {
    if (format === 'csv') {
      const csv = await exportService.generateCSV(runId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="run-${runId.slice(0, 8)}.csv"`);
      logger.info({ module: MODULE, run_id: runId, format: 'csv', size_bytes: Buffer.byteLength(csv) }, 'Export generated');
      return res.send(csv);
    }

    const data = await exportService.generateJSON(runId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="run-${runId.slice(0, 8)}.json"`);
    logger.info({ module: MODULE, run_id: runId, format: 'json', http_samples: data.http_samples.length, ws_samples: data.ws_samples.length }, 'Export generated');
    return res.json(data);
  } catch (err: any) {
    logger.error({ module: MODULE, run_id: runId, format, error_detail: err.message }, 'Export fail');
    if (err.message === 'Run not found') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    return res.status(500).json({ error: { code: 'EXPORT_FAILED', message: err.message } });
  }
});

// GET /api/v1/providers/compare?provider_ids=a,b,c
router.get('/providers/compare', async (req, res) => {
  const providerIds = ((req.query.provider_ids as string) || '').split(',').filter(Boolean);

  logger.info({ module: MODULE, provider_count: providerIds.length, provider_ids: providerIds }, 'Compare requested');

  try {
    if (providerIds.length < 2) {
      return res.status(400).json({ error: { code: 'MIN_PROVIDERS', message: 'Need at least 2 providers' } });
    }
    if (providerIds.length > 5) {
      return res.status(400).json({ error: { code: 'MAX_PROVIDERS', message: 'Max 5 providers' } });
    }

    const comparisons = await exportService.compareProviders(providerIds);
    logger.info({ module: MODULE, provider_count: comparisons.length, providers: comparisons.map(c => c.provider_name) }, 'Compare generated');
    return res.json({ data: comparisons });
  } catch (err: any) {
    logger.error({ module: MODULE, provider_ids: providerIds, error_detail: err.message }, 'Compare fail');
    return res.status(500).json({ error: { code: 'COMPARE_FAILED', message: err.message } });
  }
});

export default router;
```

### 4.3 exportService

```typescript
// api/src/services/exportService.ts
import { db } from '../db/pool';

function computeGrade(score: number): string {
  if (score >= 0.90) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.60) return 'C';
  if (score >= 0.40) return 'D';
  return 'F';
}

export const exportService = {
  async generateJSON(runId: string): Promise<RunExport> {
    const run = await db.query(`
      SELECT tr.*, pe.label as proxy_label, p.name as provider_name
      FROM test_run tr
      JOIN proxy_endpoint pe ON tr.proxy_id = pe.id
      JOIN provider p ON pe.provider_id = p.id
      WHERE tr.id = $1
    `, [runId]);
    if (!run.rows[0]) throw new Error('Run not found');

    const summary = await db.query('SELECT * FROM run_summary WHERE run_id = $1', [runId]);
    const httpSamples = await db.query('SELECT * FROM http_sample WHERE run_id = $1 ORDER BY seq', [runId]);
    const wsSamples = await db.query('SELECT * FROM ws_sample WHERE run_id = $1 ORDER BY seq', [runId]);
    const ipChecks = await db.query('SELECT * FROM ip_check_result WHERE run_id = $1 ORDER BY checked_at', [runId]);

    const r = run.rows[0];
    const s = summary.rows[0] || {};

    // WARN if 0 samples — indicates test may not have run or data pipeline issue
    if (httpSamples.rows.length === 0) {
      logger.warn({ module: 'routes.export', run_id: runId, format: 'json', sample_type: 'http' }, 'Export with zero HTTP samples');
    }
    if (wsSamples.rows.length === 0) {
      logger.warn({ module: 'routes.export', run_id: runId, format: 'json', sample_type: 'ws' }, 'Export with zero WS samples');
    }

    return {
      meta: {
        run_id: runId,
        proxy_label: r.proxy_label,
        provider_name: r.provider_name,
        status: r.status,
        started_at: r.started_at,
        stopped_at: r.stopped_at,
        duration_ms: r.stopped_at && r.started_at
          ? new Date(r.stopped_at).getTime() - new Date(r.started_at).getTime()
          : undefined,
        exported_at: new Date().toISOString(),
        format: 'json',
      },
      summary: s,
      scoring: {
        score_total: s.score_total ?? 0,
        grade: computeGrade(s.score_total ?? 0),
        components: {
          uptime: { score: s.score_uptime ?? 0, weight: 0.25 },
          latency: { score: s.score_latency ?? 0, weight: 0.25 },
          jitter: { score: s.score_jitter ?? 0, weight: 0.15 },
          ws: { score: s.score_ws ?? 0, weight: 0.15 },
          security: { score: s.score_security ?? 0, weight: 0.20 },
        },
        // **Weight redistribution**: If score_ws or score_security is null (phase skipped),
        // exportService MUST recalculate weights using Sprint 3 redistribution formula:
        // - WS skipped: 0.294×uptime + 0.294×latency + 0.176×jitter + 0.235×security
        // - Security skipped: 0.3125×uptime + 0.3125×latency + 0.1875×jitter + 0.1875×ws
        // - Both skipped (Sprint 1 mode): 0.385×uptime + 0.385×latency + 0.230×jitter
        // The `weights` field in export JSON MUST reflect actual weights used, not hardcoded values.
      },
      http_samples: httpSamples.rows,
      ws_samples: wsSamples.rows,
      ip_checks: ipChecks.rows,
    };
  },

  async generateCSV(runId: string): Promise<string> {
    const httpSamples = await db.query(
      'SELECT * FROM http_sample WHERE run_id = $1 AND is_warmup = false ORDER BY seq',
      [runId]
    );

    const headers = ['seq', 'method', 'is_https', 'target_url', 'status_code', 'error_type', 'tcp_connect_ms', 'tls_handshake_ms', 'ttfb_ms', 'total_ms', 'bytes_sent', 'bytes_received', 'measured_at'];

    const rows = httpSamples.rows.map(s =>
      headers.map(h => {
        const val = s[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return String(val);
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  },

  async compareProviders(providerIds: string[]): Promise<ProviderComparison[]> {
    const result = await db.query(`
      WITH latest_runs AS (
        SELECT DISTINCT ON (pe.id) pe.id as proxy_id, pe.provider_id, tr.id as run_id
        FROM proxy_endpoint pe
        JOIN test_run tr ON tr.proxy_id = pe.id
        WHERE pe.provider_id = ANY($1) AND tr.status = 'completed'
        ORDER BY pe.id, tr.finished_at DESC NULLS LAST
      )
      SELECT
        p.id as provider_id,
        p.name as provider_name,
        COUNT(DISTINCT lr.proxy_id) as proxy_count,
        COUNT(lr.run_id) as total_runs,
        AVG(rs.score_total) as avg_score_total,
        AVG(rs.score_uptime) as avg_score_uptime,
        AVG(rs.score_latency) as avg_score_latency,
        AVG(rs.score_jitter) as avg_score_jitter,
        AVG(rs.score_ws) as avg_score_ws,
        AVG(rs.score_security) as avg_score_security,
        AVG(rs.uptime_ratio) as avg_uptime_ratio,
        AVG(rs.ttfb_p95_ms) as avg_ttfb_p95_ms,
        AVG(rs.ws_rtt_avg_ms) as avg_ws_rtt_ms,
        AVG(CASE WHEN rs.ip_clean THEN 1.0 ELSE 0.0 END) as ip_clean_ratio,
        AVG(CASE WHEN rs.ip_geo_match THEN 1.0 ELSE 0.0 END) as geo_match_ratio,
        MAX(rs.score_total) as best_score
      FROM provider p
      JOIN latest_runs lr ON lr.provider_id = p.id
      JOIN run_summary rs ON rs.run_id = lr.run_id
      WHERE p.id = ANY($1)
      GROUP BY p.id, p.name
      ORDER BY AVG(rs.score_total) DESC
    `, [providerIds]);

    return result.rows.map(r => ({
      ...r,
      best_grade: computeGrade(r.best_score),
      avg_grade: computeGrade(r.avg_score_total),
    }));
  },
};
```

### 4.4 Logging (8 events — server)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `routes.export` | Export requested | INFO | `run_id`, `format` (json/csv) |
| 2 | `routes.export` | Export generated | INFO | `run_id`, `format`, `size_bytes` or sample counts |
| 3 | `routes.export` | Export fail | ERROR | `run_id`, `format`, `error_detail` |
| 4 | `routes.export` | Export with zero HTTP samples | WARN | `run_id`, `format`, `sample_type: "http"` |
| 5 | `routes.export` | Export with zero WS samples | WARN | `run_id`, `format`, `sample_type: "ws"` |
| 6 | `routes.export` | Compare requested | INFO | `provider_count`, `provider_ids` |
| 7 | `routes.export` | Compare generated | INFO | `provider_count`, `providers` (names) |
| 8 | `routes.export` | Compare fail | ERROR | `provider_ids`, `error_detail` |

### Acceptance Criteria — Task 4
- [ ] GET /runs/:id/export -> JSON with meta + summary + scoring + samples + ip_checks
- [ ] GET /runs/:id/export?format=csv -> CSV with Content-Disposition header
- [ ] CSV contains flattened http_samples (no warmup)
- [ ] GET /providers/compare?provider_ids=a,b -> comparison data for 2-5 providers
- [ ] Compare aggregates across latest completed runs per proxy per provider
- [ ] 400 if < 2 or > 5 providers
- [ ] 404 if run not found for export
- [ ] Logging: 8 events covering request/success/fail for both endpoints + WARN for zero samples

---

## Task 5: Comparison Page (Radar Chart)

### Mục tiêu
Tạo /compare page với ProviderSelect (multi-select min 2, max 5), RadarCompareChart (recharts RadarChart 5 axes — Uptime/Latency/Jitter/WS/Security, each provider = colored polygon), ComparisonTable (side-by-side metrics), useCompare hook.

### Files tạo/sửa

```
dashboard/src/
├── app/
│   └── compare/
│       └── page.tsx                    ← NEW — comparison page
├── hooks/
│   └── useCompare.ts                   ← NEW — fetch comparison data
├── components/
│   └── compare/
│       ├── ProviderSelect.tsx          ← NEW — multi-select provider picker
│       ├── RadarCompareChart.tsx       ← NEW — radar chart visualization
│       └── ComparisonTable.tsx         ← NEW — side-by-side metrics table
└── components/
    └── layout/
        └── Sidebar.tsx                 ← MODIFY — add Compare nav item
```

Also modify: `dashboard/src/types/index.ts` — add ProviderComparison + RadarDataPoint types

### 5.1 useCompare Hook

```typescript
// dashboard/src/hooks/useCompare.ts
'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export function useCompare() {
  const [comparisons, setComparisons] = useState<ProviderComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComparison = useCallback(async (providerIds: string[]) => {
    setLoading(true);
    setError(null);

    if (process.env.NODE_ENV === 'development') {
      console.debug('Compare requested', { module: 'pages.compare', provider_count: providerIds.length });
    }

    try {
      const res = await apiClient.get<ProviderComparison[]>('/providers/compare', { provider_ids: providerIds.join(',') });
      setComparisons(res.data);

      if (process.env.NODE_ENV === 'development') {
        console.debug('Compare loaded', { module: 'pages.compare', provider_count: res.data.length, providers: res.data.map(c => c.provider_name) });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load comparison');
      if (process.env.NODE_ENV === 'development') {
        console.error('Compare error', { module: 'pages.compare', error_detail: err.message });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { comparisons, loading, error, fetchComparison };
}
```

### 5.2 ProviderSelect — Multi-select Component

```tsx
// dashboard/src/components/compare/ProviderSelect.tsx
'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';

interface Provider { id: string; name: string; }

interface ProviderSelectProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  min?: number;
  max?: number;
}

export function ProviderSelect({ selected, onChange, min = 2, max = 5 }: ProviderSelectProps) {
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    apiClient.get<Provider[]>('/providers')
      .then(res => setProviders(res.data))
      .catch(err => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Provider list fetch failed', {
            module: 'pages.compare',
            error_detail: err.message,
          });
        }
      });
  }, []);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else if (selected.length < max) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        Select Providers ({min}-{max})
      </label>
      <div className="flex flex-wrap gap-2">
        {providers.map(p => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              selected.includes(p.id)
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>
      {selected.length < min && (
        <p className="text-xs text-amber-600">Select at least {min} providers to compare</p>
      )}
    </div>
  );
}
```

### 5.3 RadarCompareChart

```
Radar display:
         Uptime
          /\
    Sec /    \ Latency
       /  \  /
      /   \/  \
   WS -------- Jitter

  -- BrightData (blue polygon)
  .. Oxylabs (red polygon)
```

```tsx
// dashboard/src/components/compare/RadarCompareChart.tsx
'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip } from 'recharts';
import { ChartContainer } from '../charts/ChartContainer';
import { PROVIDER_COLORS } from '../charts/chart-utils';

const RADAR_AXES = ['Uptime', 'Latency', 'Jitter', 'WS', 'Security'];

interface RadarCompareChartProps {
  comparisons: ProviderComparison[];
  loading?: boolean;
}

export function RadarCompareChart({ comparisons, loading }: RadarCompareChartProps) {
  const radarData = RADAR_AXES.map(axis => {
    const point: Record<string, any> = { axis };
    comparisons.forEach(c => {
      const scoreKey = `avg_score_${axis.toLowerCase()}`;
      point[c.provider_name] = Number((c as any)[scoreKey] ?? 0);
    });
    return point;
  });

  return (
    <ChartContainer title="Provider Comparison -- Radar" loading={loading} empty={comparisons.length < 2} emptyMessage="Select at least 2 providers" height={400}>
      <RadarChart data={radarData}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 10 }} tickFormatter={(v) => v.toFixed(1)} />
        <Tooltip />
        <Legend />
        {comparisons.map((c, i) => (
          <Radar
            key={c.provider_id}
            name={c.provider_name}
            dataKey={c.provider_name}
            stroke={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
            fill={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ChartContainer>
  );
}
```

### 5.4 ComparisonTable

```tsx
// dashboard/src/components/compare/ComparisonTable.tsx
'use client';

import { formatMs, formatPercent } from '../charts/chart-utils';

interface ComparisonTableProps {
  comparisons: ProviderComparison[];
}

const METRICS = [
  { key: 'avg_score_total', label: 'Overall Score', format: (v: number) => v.toFixed(3) },
  { key: 'avg_grade', label: 'Avg Grade', format: (v: string) => v },
  { key: 'avg_uptime_ratio', label: 'Uptime %', format: (v: number) => formatPercent(v) },
  { key: 'avg_ttfb_p95_ms', label: 'Latency P95', format: (v: number) => formatMs(v) },
  { key: 'avg_ws_rtt_ms', label: 'WS RTT', format: (v: number) => formatMs(v) },
  { key: 'ip_clean_ratio', label: 'IP Clean', format: (v: number) => formatPercent(v) },
  { key: 'geo_match_ratio', label: 'Geo Match', format: (v: number) => formatPercent(v) },
  { key: 'total_runs', label: 'Total Runs', format: (v: number) => String(v) },
];

export function ComparisonTable({ comparisons }: ComparisonTableProps) {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && comparisons.length > 0) {
    console.debug('Comparison table rendered', {
      module: 'pages.compare',
      provider_count: comparisons.length,
      providers: comparisons.map(c => c.provider_name),
    });
  }

  return (
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-700">Metric</th>
            {comparisons.map(c => (
              <th key={c.provider_id} className="px-4 py-3 text-center font-medium text-gray-700">{c.provider_name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map(m => (
            <tr key={m.key} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-600">{m.label}</td>
              {comparisons.map(c => (
                <td key={c.provider_id} className="px-4 py-2 text-center font-mono">
                  {m.format((c as any)[m.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 5.5 Compare Page

```tsx
// dashboard/src/app/compare/page.tsx
'use client';

import { useState } from 'react';
import { ProviderSelect } from '@/components/compare/ProviderSelect';
import { RadarCompareChart } from '@/components/compare/RadarCompareChart';
import { ComparisonTable } from '@/components/compare/ComparisonTable';
import { useCompare } from '@/hooks/useCompare';

export default function ComparePage() {
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const { comparisons, loading, error, fetchComparison } = useCompare();

  const handleCompare = () => {
    if (selectedProviders.length >= 2) {
      fetchComparison(selectedProviders);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Compare Providers</h1>
      <ProviderSelect selected={selectedProviders} onChange={setSelectedProviders} />
      <button
        onClick={handleCompare}
        disabled={selectedProviders.length < 2 || loading}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Compare'}
      </button>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {comparisons.length >= 2 && (
        <>
          <RadarCompareChart comparisons={comparisons} />
          <ComparisonTable comparisons={comparisons} />
        </>
      )}
    </div>
  );
}
```

### 5.6 Sidebar Update

```tsx
// dashboard/src/components/layout/Sidebar.tsx — add Compare link
const navItems = [
  { href: '/', label: 'Overview', icon: HomeIcon },
  { href: '/providers', label: 'Providers', icon: BuildingIcon },
  { href: '/runs', label: 'Runs', icon: PlayIcon },
  { href: '/compare', label: 'Compare', icon: ChartBarIcon },  // NEW Sprint 4
];
```

### 5.7 Logging (5 events — client)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `pages.compare` (client) | Compare requested | console.debug | `provider_count` |
| 2 | `pages.compare` (client) | Compare loaded | console.debug | `provider_count`, `providers` (names) |
| 3 | `pages.compare` (client) | Compare error | console.error | `error_detail` |
| 4 | `pages.compare` (client) | Provider list fetch failed | console.error | `error_detail` |
| 5 | `pages.compare` (client) | Comparison table rendered | console.debug | `provider_count`, `providers` (names) |

### Acceptance Criteria — Task 5
- [ ] /compare page renders with ProviderSelect
- [ ] Multi-select: min 2, max 5 providers
- [ ] RadarChart shows 5 axes (Uptime/Latency/Jitter/WS/Security)
- [ ] Each provider = colored polygon on radar
- [ ] ComparisonTable shows side-by-side metrics (8 rows)
- [ ] Compare button disabled when < 2 providers selected
- [ ] Sidebar has "Compare" nav item
- [ ] Error state handled

---

## Task 6: Export Feature (Download)

### Mục tiêu
Tạo ExportButton (dropdown JSON/CSV, spinner while downloading, disabled when pending), useExport hook (fetch blob -> URL.createObjectURL -> download trigger). Integrate vào RunHeader + Runs List.

### Files tạo/sửa

```
dashboard/src/
├── hooks/
│   └── useExport.ts                    ← NEW — blob download hook
├── components/
│   └── runs/
│       └── ExportButton.tsx            ← NEW — dropdown export button
├── components/
│   └── runs/
│       └── RunHeader.tsx               ← MODIFY — add ExportButton
├── app/
│   └── runs/
│       └── [runId]/
│           └── page.tsx                ← MODIFY — pass runId to ExportButton
└── app/
    └── runs/
        └── page.tsx                    ← MODIFY — add export per row in Runs List
```

### 6.1 useExport Hook

```typescript
// dashboard/src/hooks/useExport.ts
'use client';

import { useState, useCallback } from 'react';

export function useExport() {
  const [exporting, setExporting] = useState(false);

  const downloadExport = useCallback(async (runId: string, format: 'json' | 'csv') => {
    setExporting(true);

    if (process.env.NODE_ENV === 'development') {
      console.debug('Export requested', { module: 'pages.export', run_id: runId, format });
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/api/v1/runs/${runId}/export?format=${format}`);
      if (!response.ok) throw new Error(`Export failed: ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const ext = format === 'csv' ? 'csv' : 'json';
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-${runId.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (process.env.NODE_ENV === 'development') {
        console.debug('Export downloaded', { module: 'pages.export', run_id: runId, format, blob_size: blob.size });
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Export failed', { module: 'pages.export', run_id: runId, format, error_detail: err.message });
      }
    } finally {
      setExporting(false);
    }
  }, []);

  return { exporting, downloadExport };
}
```

> **Blob download flow**: fetch -> blob -> createObjectURL -> create <a> element -> click -> cleanup. Standard browser download pattern.

### 6.2 ExportButton Component

```tsx
// dashboard/src/components/runs/ExportButton.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useExport } from '@/hooks/useExport';

interface ExportButtonProps {
  runId: string;
  disabled?: boolean;
}

export function ExportButton({ runId, disabled }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const { exporting, downloadExport } = useExport();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled || exporting}
        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
      >
        {exporting ? (
          <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        ) : (
          <span>Export</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border rounded-lg shadow-lg z-10">
          <button
            onClick={() => { downloadExport(runId, 'json'); setOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
          >
            Download JSON
          </button>
          <button
            onClick={() => { downloadExport(runId, 'csv'); setOpen(false); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-t"
          >
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}
```

### 6.3 Integration

```tsx
// In RunHeader.tsx: add ExportButton next to Stop button
<ExportButton runId={runId} disabled={run.status === 'pending'} />

// In Runs List page.tsx: add export icon per row for completed runs
```

### 6.4 Logging (3 events — client)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `pages.export` (client) | Export requested | console.debug | `run_id`, `format` |
| 2 | `pages.export` (client) | Export downloaded | console.debug | `run_id`, `format`, `blob_size` |
| 3 | `pages.export` (client) | Export failed | console.error | `run_id`, `format`, `error_detail` |

### Acceptance Criteria — Task 6
- [ ] ExportButton shows dropdown with JSON/CSV options
- [ ] Click JSON -> downloads .json file
- [ ] Click CSV -> downloads .csv file
- [ ] Spinner shown while downloading
- [ ] Button disabled when run status is pending
- [ ] ExportButton visible in RunHeader
- [ ] Export available in Runs List for completed runs
- [ ] Dropdown closes on outside click

---

## Task 7: Error Log Viewer

### Mục tiêu
Tạo unified ErrorLogEntry type (merge errors from http_samples + ws_samples + ip_checks), useErrorLogs hook (fetch + merge + filter), ErrorLogViewer (expandable rows, color-coded by source), ErrorLogFilters (error_type, protocol, time range), add Errors tab to Run Detail with badge count.

### Files tạo/sửa

```
dashboard/src/
├── hooks/
│   └── useErrorLogs.ts                 ← NEW — fetch, merge, filter errors
├── components/
│   └── runs/
│       ├── ErrorLogViewer.tsx          ← NEW — expandable error rows
│       └── ErrorLogFilters.tsx         ← NEW — filter controls
├── types/
│   └── index.ts                        ← MODIFY — add ErrorLogEntry type
└── app/
    └── runs/
        └── [runId]/
            └── page.tsx                ← MODIFY — add Errors tab with badge count
```

### 7.1 ErrorLogEntry Unified Type

```typescript
// dashboard/src/types/index.ts — Sprint 4 additions
interface ErrorLogEntry {
  id: string;
  source: 'http' | 'ws' | 'ip';
  error_type: string;
  error_message?: string;
  protocol?: string;           // http, https, ws, wss
  method?: string;             // GET, POST (http only)
  target_url?: string;
  status_code?: number;
  timing?: {
    tcp_connect_ms?: number;
    tls_handshake_ms?: number;
    ttfb_ms?: number;
    total_ms?: number;
    handshake_ms?: number;
    message_rtt_ms?: number;
  };
  seq?: number;
  measured_at: string;
}

interface ErrorLogFilterState {
  source?: 'http' | 'ws' | 'ip' | 'all';
  error_type?: string;
  protocol?: string;
}
```

### 7.2 useErrorLogs Hook

```typescript
// dashboard/src/hooks/useErrorLogs.ts
'use client';

import { useState, useCallback, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';

export function useErrorLogs(runId: string) {
  const [httpErrors, setHttpErrors] = useState<any[]>([]);
  const [wsErrors, setWsErrors] = useState<any[]>([]);
  const [ipErrors, setIpErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ErrorLogFilterState>({ source: 'all' });

  const fetchErrors = useCallback(async () => {
    setLoading(true);

    // Fetch each source independently — one failure doesn't block others
    let fetchedHttpErrors: any[] = [];
    let fetchedWsErrors: any[] = [];
    let fetchedIpErrors: any[] = [];

    // HTTP errors
    try {
      const httpRes = await apiClient.get(`/runs/${runId}/http-samples`, { error_only: 'true', limit: '200' });
      fetchedHttpErrors = (httpRes.data || []).filter((s: any) => s.error_type);
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error logs fetch failed', { module: 'pages.errors', source: 'http', error_detail: err.message });
      }
    }

    // WS errors
    try {
      const wsRes = await apiClient.get(`/runs/${runId}/ws-samples`, { limit: '200' });
      fetchedWsErrors = (wsRes.data || []).filter((s: any) => s.error_type || !s.connected);
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error logs fetch failed', { module: 'pages.errors', source: 'ws', error_detail: err.message });
      }
    }

    // IP errors
    try {
      const ipRes = await apiClient.get(`/runs/${runId}/ip-checks`);
      fetchedIpErrors = (ipRes.data || []).filter((s: any) => !s.is_clean || !s.geo_match);
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error logs fetch failed', { module: 'pages.errors', source: 'ip', error_detail: err.message });
      }
    }

    setHttpErrors(fetchedHttpErrors);
    setWsErrors(fetchedWsErrors);
    setIpErrors(fetchedIpErrors);

    if (process.env.NODE_ENV === 'development') {
      console.debug('Error logs loaded', {
        module: 'pages.errors',
        run_id: runId,
        http_errors: fetchedHttpErrors.length,
        ws_errors: fetchedWsErrors.length,
        ip_issues: fetchedIpErrors.length,
      });
    }

    setLoading(false);
  }, [runId]);

  const allErrors = useMemo(() => {
    const entries: ErrorLogEntry[] = [];

    httpErrors.forEach(s => entries.push({
      id: s.id,
      source: 'http',
      error_type: s.error_type,
      error_message: s.error_message,
      protocol: s.is_https ? 'https' : 'http',
      method: s.method,
      target_url: s.target_url,
      status_code: s.status_code,
      timing: {
        tcp_connect_ms: s.tcp_connect_ms,
        tls_handshake_ms: s.tls_handshake_ms,
        ttfb_ms: s.ttfb_ms,
        total_ms: s.total_ms,
      },
      seq: s.seq,
      measured_at: s.measured_at,
    }));

    wsErrors.forEach(s => entries.push({
      id: s.id,
      source: 'ws',
      error_type: s.error_type || 'connection_failed',
      error_message: s.error_message,
      protocol: s.target_url?.startsWith('wss') ? 'wss' : 'ws',
      target_url: s.target_url,
      timing: {
        tcp_connect_ms: s.tcp_connect_ms,
        tls_handshake_ms: s.tls_handshake_ms,
        handshake_ms: s.handshake_ms,
        message_rtt_ms: s.message_rtt_ms,
      },
      seq: s.seq,
      measured_at: s.measured_at,
    }));

    ipErrors.forEach(s => entries.push({
      id: s.id,
      source: 'ip',
      error_type: !s.is_clean ? 'ip_blacklisted' : 'geo_mismatch',
      error_message: !s.is_clean
        ? `Listed on ${s.blacklists_listed}/${s.blacklists_queried} blacklists`
        : `Expected ${s.expected_country}, got ${s.actual_country}`,
      measured_at: s.checked_at,
    }));

    entries.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

    return entries.filter(e => {
      if (filters.source && filters.source !== 'all' && e.source !== filters.source) return false;
      if (filters.error_type && e.error_type !== filters.error_type) return false;
      if (filters.protocol && e.protocol !== filters.protocol) return false;
      return true;
    });
  }, [httpErrors, wsErrors, ipErrors, filters]);

  const totalErrorCount = httpErrors.length + wsErrors.length + ipErrors.length;

  return { allErrors, totalErrorCount, loading, filters, setFilters, fetchErrors };
}
```

### 7.3 ErrorLogFilters Component

```tsx
// dashboard/src/components/runs/ErrorLogFilters.tsx
'use client';

interface ErrorLogFiltersComponentProps {
  filters: ErrorLogFilterState;
  onChange: (filters: ErrorLogFilterState) => void;
  errorTypes: string[];
}

export function ErrorLogFilters({ filters, onChange, errorTypes }: ErrorLogFiltersComponentProps) {
  const handleChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    onChange(newFilters);

    if (process.env.NODE_ENV === 'development') {
      console.debug('Error log filter changed', { module: 'pages.errors', filter_key: key, filter_value: value });
    }
  };

  return (
    <div className="flex gap-3 items-center">
      <select value={filters.source || 'all'} onChange={(e) => handleChange('source', e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
        <option value="all">All Sources</option>
        <option value="http">HTTP</option>
        <option value="ws">WebSocket</option>
        <option value="ip">IP Check</option>
      </select>
      <select value={filters.error_type || ''} onChange={(e) => handleChange('error_type', e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
        <option value="">All Error Types</option>
        {errorTypes.map(t => (<option key={t} value={t}>{t}</option>))}
      </select>
      <select value={filters.protocol || ''} onChange={(e) => handleChange('protocol', e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
        <option value="">All Protocols</option>
        <option value="http">HTTP</option>
        <option value="https">HTTPS</option>
        <option value="ws">WS</option>
        <option value="wss">WSS</option>
      </select>
    </div>
  );
}
```

### 7.4 ErrorLogViewer Component

```tsx
// dashboard/src/components/runs/ErrorLogViewer.tsx
'use client';

import { useState } from 'react';
import { formatMs } from '@/components/charts/chart-utils';

const SOURCE_COLORS = {
  http: 'bg-blue-100 text-blue-700',
  ws: 'bg-purple-100 text-purple-700',
  ip: 'bg-amber-100 text-amber-700',
};

interface ErrorLogViewerProps {
  errors: ErrorLogEntry[];
  loading?: boolean;
}

export function ErrorLogViewer({ errors, loading }: ErrorLogViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin h-8 w-8 border-b-2 border-blue-500 rounded-full" />
      </div>
    );
  }

  if (errors.length === 0) {
    return <div className="text-center py-8 text-gray-400">No errors found</div>;
  }

  return (
    <div className="space-y-1">
      {errors.map(err => (
        <div key={err.id} className="border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left"
          >
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[err.source]}`}>
              {err.source.toUpperCase()}
            </span>
            <span className="text-sm font-mono text-red-600 flex-1">{err.error_type}</span>
            {err.protocol && <span className="text-xs text-gray-400">{err.protocol}</span>}
            {err.method && <span className="text-xs text-gray-400">{err.method}</span>}
            <span className="text-xs text-gray-400">{new Date(err.measured_at).toLocaleTimeString()}</span>
            <span className="text-gray-400">{expandedId === err.id ? 'v' : '>'}</span>
          </button>

          {expandedId === err.id && (
            <div className="px-4 py-3 bg-gray-50 border-t text-sm space-y-1">
              {err.error_message && (
                <p><span className="text-gray-500">Message:</span> <span className="font-mono">{err.error_message}</span></p>
              )}
              {err.target_url && (
                <p><span className="text-gray-500">URL:</span> <span className="font-mono">{err.target_url}</span></p>
              )}
              {err.status_code && (
                <p><span className="text-gray-500">Status:</span> {err.status_code}</p>
              )}
              {err.timing && (
                <div className="flex gap-4">
                  {err.timing.tcp_connect_ms != null && <span className="text-gray-500">TCP: {formatMs(err.timing.tcp_connect_ms)}</span>}
                  {err.timing.tls_handshake_ms != null && <span className="text-gray-500">TLS: {formatMs(err.timing.tls_handshake_ms)}</span>}
                  {err.timing.ttfb_ms != null && <span className="text-gray-500">TTFB: {formatMs(err.timing.ttfb_ms)}</span>}
                  {err.timing.total_ms != null && <span className="text-gray-500">Total: {formatMs(err.timing.total_ms)}</span>}
                </div>
              )}
              {err.seq != null && (
                <p><span className="text-gray-500">Seq:</span> #{err.seq}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 7.5 Integration — Errors Tab with Badge Count

```tsx
// dashboard/src/app/runs/[runId]/page.tsx — add Errors tab
const { allErrors, totalErrorCount, loading: errorsLoading, filters, setFilters, fetchErrors } = useErrorLogs(runId);

// In tabs array:
{
  id: 'errors',
  label: (
    <span className="flex items-center gap-1">
      Errors
      {totalErrorCount > 0 && (
        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
          {totalErrorCount}
        </span>
      )}
    </span>
  ),
  component: (
    <div className="space-y-4">
      <ErrorLogFilters
        filters={filters}
        onChange={setFilters}
        errorTypes={[...new Set(allErrors.map(e => e.error_type))]}
      />
      <ErrorLogViewer errors={allErrors} loading={errorsLoading} />
    </div>
  ),
}
```

### 7.6 Logging (3 events — client)

| # | Module | Event | Level | Fields |
|---|--------|-------|-------|--------|
| 1 | `pages.errors` (client) | Error logs loaded | console.debug | `run_id`, `http_errors`, `ws_errors`, `ip_issues` |
| 2 | `pages.errors` (client) | Error log filter changed | console.debug | `filter_key`, `filter_value` |
| 3 | `pages.errors` (client) | Error logs fetch failed | console.error | `source` (http/ws/ip), `error_detail` |

### Acceptance Criteria — Task 7
- [ ] Errors tab visible in Run Detail with red badge count
- [ ] ErrorLogViewer shows rows from http + ws + ip sources
- [ ] Color-coded source badges (HTTP=blue, WS=purple, IP=amber)
- [ ] Click row to expand -> shows full error detail (message, URL, timing, seq)
- [ ] ErrorLogFilters: source, error_type, protocol dropdowns
- [ ] Filter changes update displayed errors immediately
- [ ] Empty state when no errors
- [ ] Loading state shows spinner

---

## Task 8: E2E Integration Test

### Mục tiêu
Test toàn bộ Sprint 4 flow end-to-end: charts render, comparison page, export download, error log viewer. 10-step scenario, 20 functional checks, DL1-DL12 logging checks.

### 8.1 Kịch bản test (10 bước)

```
Bước 1:  docker compose up -d -> 5 services start
Bước 2:  Dashboard -> tạo 2 providers (BrightData, Oxylabs) + 1 proxy mỗi provider
Bước 3:  Start Test cho cả 2 proxies -> 2 runs running
Bước 4:  Wait 2-3 phút -> data accumulates -> navigate to Run Detail
Bước 5:  Charts tab -> verify LatencyChart + UptimeTimeline render
Bước 6:  Verify ScoreGauge + ScoreHistoryChart render
Bước 7:  Compare page -> select 2 providers -> Compare -> radar chart + table render
Bước 8:  Export: Run Detail -> ExportButton -> JSON -> file downloads
Bước 9:  Export: Run Detail -> ExportButton -> CSV -> file downloads
Bước 10: Errors tab -> verify error log viewer loads
```

### 8.2 Verification Checks (20 functional)

| # | Check | Expected |
|---|-------|----------|
| 1 | 5 services start | `docker compose up` -> all healthy |
| 2 | 2 runs created | Both running after Start Test |
| 3 | Charts tab visible | "Charts" tab in Run Detail |
| 4 | LatencyChart renders | 3 lines (P50/P95/P99) visible |
| 5 | UptimeTimeline renders | Stacked areas (green/red) + uptime line |
| 6 | ScoreGauge renders | Radial arc with score + grade center text |
| 7 | ScoreHistoryChart renders | Line chart with grade threshold bands |
| 8 | Charts loading state | Spinner while data loading |
| 9 | Charts empty state | "No data" message when no samples |
| 10 | Compare page accessible | /compare loads without error |
| 11 | ProviderSelect works | 2 providers selectable, min 2 enforced |
| 12 | RadarChart renders | 5-axis radar with 2 provider polygons |
| 13 | ComparisonTable renders | Side-by-side metrics for 2 providers |
| 14 | Export JSON works | JSON file downloads with correct Content-Type |
| 15 | Export CSV works | CSV file downloads, contains http_sample rows |
| 16 | Export button states | Disabled when pending, spinner while downloading |
| 17 | Errors tab visible | "Errors" tab with badge count |
| 18 | Error log viewer | Error rows expandable with detail |
| 19 | Error filters | Source/error_type/protocol filters work |
| 20 | Sidebar nav | "Compare" link in sidebar navigates correctly |

### 8.3 Logging Checks (DL1-DL12)

| # | Check | Verify | Expected |
|---|-------|--------|----------|
| DL1 | Latency chart log | Browser console: filter "Latency chart rendered" | `data_points > 0`, `latest_p95 > 0` |
| DL2 | Uptime chart log | Browser console: filter "Uptime chart rendered" | `data_points > 0`, `latest_uptime` present |
| DL3 | Score gauge log | Browser console: filter "Score gauge rendered" | `score`, `grade`, `color` present |
| DL4 | Score history log | Browser console: filter "Score history snapshot" | `history_length > 0`, `latest_score` present |
| DL5 | Compare logs | Browser console: filter "Compare" | "Compare requested" + "Compare loaded" sequence |
| DL6 | Export logs | Browser console: filter "Export" | "Export requested" + "Export downloaded" sequence |
| DL7 | Error logs | Browser console: filter "Error logs loaded" | `http_errors` + `ws_errors` + `ip_issues` counts |
| DL8 | API export/compare | `docker compose logs api` grep "Export\|Compare" | "Export requested" + "Export generated" + "Compare requested" + "Compare generated" |
| DL9 | Chart empty state log | Browser console: filter "Chart empty data" | `chart_title` + `empty_message` khi navigate Charts tab trước khi có data |
| DL10 | Provider fetch error | Browser console: filter "Provider list fetch failed" | `error_detail` khi API down, test bằng tắt API rồi mở /compare |
| DL11 | Export empty samples | `docker compose logs api` grep "zero.*samples" | WARN log khi export run chưa có HTTP hoặc WS samples |
| DL12 | Chart data aggregation error | Browser console: filter "Chart data aggregation failed" | `module: "charts.data"`, `fn_name`, `error` khi samples data corrupt/invalid |

### 8.4 Quick Verify Script

```bash
#!/bin/bash
echo "=== Sprint 4 Verification ==="

# 1. Chart data availability
echo ""
echo "--- 1. Chart data availability ---"
RUN_ID=$(docker compose exec postgres psql -U proxytest -t -c "SELECT id FROM test_run WHERE status='completed' LIMIT 1;" | tr -d ' ')
echo "Run ID: $RUN_ID"
docker compose exec postgres psql -U proxytest -c "SELECT COUNT(*) as http_samples FROM http_sample WHERE run_id='$RUN_ID';"
docker compose exec postgres psql -U proxytest -c "SELECT COUNT(*) as ws_samples FROM ws_sample WHERE run_id='$RUN_ID';"

# 2. Export endpoint JSON
echo ""
echo "--- 2. Export endpoint (JSON) ---"
curl -s "http://localhost:4000/api/v1/runs/$RUN_ID/export?format=json" | jq '.meta.run_id, .meta.format, (.http_samples | length), (.ws_samples | length)'

# 3. Export endpoint CSV
echo ""
echo "--- 3. Export endpoint (CSV) ---"
curl -s "http://localhost:4000/api/v1/runs/$RUN_ID/export?format=csv" | head -3

# 4. Compare endpoint
echo ""
echo "--- 4. Compare endpoint ---"
PROVIDER_IDS=$(docker compose exec postgres psql -U proxytest -t -c "SELECT string_agg(id::text, ',') FROM provider LIMIT 2;" | tr -d ' ')
curl -s "http://localhost:4000/api/v1/providers/compare?provider_ids=$PROVIDER_IDS" | jq '.data[] | {provider_name, avg_score_total, avg_grade}'

# 5. API logs
echo ""
echo "--- 5. API export/compare logs ---"
docker compose logs api | grep -E "Export requested|Export generated|Compare requested|Compare generated" | tail -10

# 6. Scores
echo ""
echo "--- 6. Scores ---"
docker compose exec postgres psql -U proxytest -c "SELECT score_total, score_uptime, score_latency, score_jitter, score_ws, score_security FROM run_summary LIMIT 3;"

echo ""
echo "=== Sprint 4 Verification Complete ==="
```

### Acceptance Criteria — Task 8
- [ ] 20 functional checks pass
- [ ] DL1-DL12 logging checks pass
- [ ] Quick verify script runs without errors
- [ ] Charts render with actual data from running/completed tests
- [ ] Comparison page works with 2+ providers
- [ ] Export JSON + CSV download correctly
- [ ] Error log viewer shows unified error list

---

## Logging Tổng kết Sprint 4

### API (Server) — Sprint 4 log points mới

| Module | Events | Level mix |
|--------|--------|-----------|
| `routes.export` (export) | 5 | INFO/WARN/ERROR |
| `routes.export` (compare) | 3 | INFO/ERROR |
| **Tổng API Sprint 4** | **8** | |

> Export thêm 2 WARN events: "Export with zero HTTP samples" + "Export with zero WS samples" — phát hiện export run chưa có data.

### Dashboard (Client) — Sprint 4 log points mới

| Module | Events | Level mix |
|--------|--------|-----------|
| `charts.container` | 1 | console.warn |
| `charts.data` | 1 | console.error |
| `charts.latency` | 1+err | console.debug/error |
| `charts.uptime` | 1+err | console.debug/error |
| `charts.score_gauge` | 1 | console.debug |
| `charts.score_history` | 2+err | console.debug/error |
| `pages.compare` | 5 | console.debug/error |
| `pages.export` | 3 | console.debug/error |
| `pages.errors` | 3 | console.debug/error |
| **Tổng Dashboard Sprint 4** | **19** | |

> **"+err" notation**: "1+err" means 1 counted event (e.g., "rendered") plus this module CAN receive ChartErrorBoundary errors. Error events are already counted in their respective Task logging tables (Task 2: latency render error, Task 3: score_history render error). Do NOT double-count.

> ChartErrorBoundary render errors are attributed to their respective chart modules (`charts.latency`, `charts.uptime`, `charts.score_history`) via dynamic `module: 'charts.' + chartType`. `charts.data` = useChartData aggregation error. So với bản gốc (14), thêm 5 events: ChartContainer empty (1), useChartData error (1), ProviderSelect fetch failed (1), ComparisonTable rendered (1), Error logs fetch failed (1) = net +5.

### Sprint 4 Tổng log points mới: 27

| Service | Server | Client | Tổng |
|---------|--------|--------|------|
| API (Node.js) | 8 | 0 | 8 |
| Dashboard (Next.js) | 0 | 19 | 19 |
| **Tổng Sprint 4** | **8** | **19** | **27** |

> Runner (Go) và Target (Node.js) **KHÔNG cần thêm log** — Sprint 4 chỉ thêm features ở API + Dashboard.
>
> **Counting convention**: Parameterized events (e.g., 'Chart render error' with different `module` values like `charts.latency`, `charts.score_history`) are counted once per unique module context where they can fire. ChartErrorBoundary render errors are attributed to their respective chart module via dynamic `module: 'charts.' + chartType`.

---

## Files tổng cộng Sprint 4

```
Tạo mới (23 files):
  dashboard/src/components/charts/ChartContainer.tsx      ← Responsive chart wrapper
  dashboard/src/components/charts/ChartTooltip.tsx        ← Custom tooltip
  dashboard/src/components/charts/ChartErrorBoundary.tsx  ← Error boundary for chart render errors
  dashboard/src/components/charts/chart-utils.ts          ← Colors, formatters, helpers
  dashboard/src/components/charts/LatencyChart.tsx        ← P50/P95/P99 line chart
  dashboard/src/components/charts/UptimeTimeline.tsx      ← Stacked area chart
  dashboard/src/components/charts/ScoreGauge.tsx          ← Radial gauge score+grade
  dashboard/src/components/charts/ScoreHistoryChart.tsx   ← Score over time line chart
  dashboard/src/components/compare/ProviderSelect.tsx     ← Multi-select provider picker
  dashboard/src/components/compare/RadarCompareChart.tsx  ← Radar chart 5 axes
  dashboard/src/components/compare/ComparisonTable.tsx    ← Side-by-side metrics
  dashboard/src/components/runs/ExportButton.tsx          ← Dropdown export JSON/CSV
  dashboard/src/components/runs/ErrorLogViewer.tsx        ← Expandable error rows
  dashboard/src/components/runs/ErrorLogFilters.tsx       ← Error filter controls
  dashboard/src/app/compare/page.tsx                      ← Comparison page
  dashboard/src/hooks/useChartData.ts                     ← Aggregate samples -> chart data
  dashboard/src/hooks/useSummaryHistory.ts                ← Accumulate summary snapshots
  dashboard/src/hooks/useCompare.ts                       ← Fetch comparison data
  dashboard/src/hooks/useExport.ts                        ← Blob download hook
  dashboard/src/hooks/useErrorLogs.ts                     ← Fetch, merge, filter errors
  api/src/routes/export.ts                                ← Export + Compare endpoints
  api/src/services/exportService.ts                       ← Data transformation + CSV

Sửa đổi (9 files):
  dashboard/package.json                                  ← Add recharts dependency
  dashboard/src/types/index.ts                            ← Chart types, ErrorLogEntry, comparison types
  dashboard/src/app/runs/[runId]/page.tsx                ← Add Charts, Errors tabs
  dashboard/src/app/runs/page.tsx                         ← Add export per row
  dashboard/src/components/runs/RunHeader.tsx             ← Add ExportButton
  dashboard/src/components/layout/Sidebar.tsx             ← Add Compare nav item
  api/src/routes/index.ts                                 ← Register export routes
  api/src/services/runService.ts                          ← Add comparison query helpers
  api/src/types/index.ts                                  ← Add RunExport, ProviderComparison types
```

**Tổng: 23 files mới + 9 files sửa = 32 files**

---

## Verification

### Functional Checks (20) — xem Task 8, Section 8.2

### Logging Checks (DL1-DL12) — xem Task 8, Section 8.3

### Quick Verify Script — xem Task 8, Section 8.4

> **Sprint 4 hoàn thành khi**: 20 functional checks pass + DL1-DL12 logging checks pass + Quick verify script pass + Dashboard hiển thị charts, comparison, export, error viewer đầy đủ.

> **Hệ thống hoàn chỉnh khi Sprint 4 done**: Toàn bộ 4 sprints (Sprint 1: Backend + Runner, Sprint 2: Dashboard UI, Sprint 3: WS+IP+Parallel, Sprint 4: Charts+Compare+Export) hoàn thành = Proxy Stability Test System sẵn sàng sử dụng.

---

## Appendix: Cross-Sprint Logging Gap Notes

> Ghi nhận từ comprehensive logging audit across 4 sprints. Các gaps dưới đây **KHÔNG blocking Sprint 4 completion** — ghi lại để cải thiện post-Sprint 4 nếu cần.

### Tier 1 — High Severity (nên fix sớm)

| # | Gap | Sprint | Module | Severity | Mô tả |
|---|-----|--------|--------|----------|-------|
| CS-1 | Scheduler `failure_reason` missing | 3 | `engine.scheduler` | HIGH | Khi proxy goroutine fail, scheduler log "done" nhưng không log reason (panic? timeout? error?). Nên thêm `failure_reason` field. |
| CS-2 | Request correlation IDs missing | 1-4 | All | HIGH | Không có `correlation_id` xuyên suốt: Runner request → API batch → Dashboard display. Khó trace 1 request cụ thể từ Runner đến UI. |
| CS-3 | Goroutine health checks missing | 3 | `engine.orchestrator` | MEDIUM | Orchestrator không periodic log goroutine health status (alive/dead/hung). Chỉ biết khi goroutine done. |

### Tier 2 — Medium/Low Severity (nice to have)

| # | Gap | Sprint | Module | Severity | Mô tả |
|---|-----|--------|--------|----------|-------|
| CS-4 | WS reconnection `backoff_ms` | 3 | `proxy.ws_tester` | MEDIUM | Reconnect log thiếu `backoff_ms` field — không biết đang retry sau bao lâu. |
| CS-5 | GET list endpoints not logged | 2 | `routes.*` | MEDIUM | GET /providers, GET /runs, GET /proxies endpoints không log request (chỉ log mutations). Thiếu visibility cho read traffic. |
| CS-6 | Polling interval change not logged | 2 | `usePolling` | LOW | Khi polling interval thay đổi (3s → 5s → 10s), không có log event nào. |
| CS-7 | Scoring weight distribution not logged | 3 | `scoring.scorer` | LOW | Score computed log có components nhưng thiếu weight distribution (nếu phase skipped, weights redistribute). |
| CS-8 | Export edge cases (FIXED) | 4 | `routes.export` | — | **Đã fix trong Sprint 4 v1.8**: Export zero samples WARN added. |

### Coverage Summary by Module

| Module Group | Sprint | Log Points | Coverage |
|--------------|--------|-----------|----------|
| Target Service | 1 | 11 | 100% |
| API Server (routes, services) | 1-4 | 30+ | 95% (GET list endpoints missing) |
| Runner (http_tester, https_tester) | 1 | 40+ | 98% |
| Runner (ws_tester) | 3 | 26 | 95% (backoff_ms missing) |
| Runner (orchestrator, scheduler) | 1, 3 | 20+ | 90% (failure_reason, health checks) |
| Runner (scoring) | 3 | 4 | 85% (weight distribution) |
| Dashboard (client) | 2, 4 | 49 + 18 = 67 | 95% (polling interval) |
| **Overall** | **1-4** | **~200+** | **~94%** |

> **Kết luận**: Logging coverage đã tăng từ 91% → ~94% sau Sprint 4 v1.8 fixes. Các gaps còn lại chủ yếu ở Runner internals (correlation IDs, health checks) — có thể thêm trong maintenance phase sau khi hệ thống đã deploy.
