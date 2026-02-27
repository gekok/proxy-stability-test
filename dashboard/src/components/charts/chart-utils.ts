// Chart utility functions and constants for recharts

export const CHART_COLORS = {
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  purple: '#a855f7',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  gray: '#6b7280',
} as const;

export const SCORE_BAND_COLORS = {
  A: 'rgba(34, 197, 94, 0.1)',   // green
  B: 'rgba(59, 130, 246, 0.1)',   // blue
  C: 'rgba(234, 179, 8, 0.1)',    // yellow
  D: 'rgba(249, 115, 22, 0.1)',   // orange
  F: 'rgba(239, 68, 68, 0.1)',    // red
} as const;

export function formatMs(val: number | null | undefined): string {
  if (val == null) return '—';
  if (val < 1) return '<1 ms';
  return `${Math.round(val)} ms`;
}

export function formatPercent(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return CHART_COLORS.green;
    case 'B': return CHART_COLORS.blue;
    case 'C': return CHART_COLORS.yellow;
    case 'D': return CHART_COLORS.amber;
    default:  return CHART_COLORS.red;
  }
}

export function scoreColor(score: number): string {
  if (score >= 0.9) return CHART_COLORS.green;
  if (score >= 0.75) return CHART_COLORS.blue;
  if (score >= 0.6) return CHART_COLORS.yellow;
  if (score >= 0.4) return CHART_COLORS.amber;
  return CHART_COLORS.red;
}

export interface TimeBucket {
  time: string;
  timestamp: number;
}

export interface LatencyBucket extends TimeBucket {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

export interface UptimeBucket extends TimeBucket {
  success: number;
  error: number;
  uptimeRatio: number;
}

/** Bucket samples by time intervals (default 30s) */
export function bucketByTime<T extends { measured_at: string }>(
  items: T[],
  intervalMs: number = 30000,
): Map<number, T[]> {
  if (items.length === 0) return new Map();

  const sorted = [...items].sort(
    (a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime()
  );

  const startTime = new Date(sorted[0].measured_at).getTime();
  const buckets = new Map<number, T[]>();

  for (const item of sorted) {
    const t = new Date(item.measured_at).getTime();
    const bucketKey = startTime + Math.floor((t - startTime) / intervalMs) * intervalMs;
    const existing = buckets.get(bucketKey) || [];
    existing.push(item);
    buckets.set(bucketKey, existing);
  }

  return buckets;
}

/** Compute percentile from sorted array */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const frac = rank - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}
