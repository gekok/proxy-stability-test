'use client';

import { ProviderComparison, getScoreColor } from '@/types';
import { Card } from '@/components/ui/Card';

interface ComparisonTableProps {
  data: ProviderComparison[];
}

function formatScore(val: number): string {
  return val.toFixed(3);
}

function formatMs(val: number): string {
  return `${Math.round(val)} ms`;
}

function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function ScoreCell({ score }: { score: number }) {
  const color = getScoreColor(score);
  const cls = color === 'good' ? 'text-green-600' : color === 'warning' ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-mono font-semibold ${cls}`}>{formatScore(score)}</span>;
}

const METRICS = [
  { label: 'Total Score', key: 'avg_score_total', render: (v: number) => <ScoreCell score={v} /> },
  { label: 'Grade', key: 'avg_grade', render: (v: string) => <span className="font-bold">{v}</span> },
  { label: 'Best Grade', key: 'best_grade', render: (v: string) => <span className="font-bold">{v}</span> },
  { label: 'Uptime Score', key: 'avg_score_uptime', render: (v: number) => <ScoreCell score={v} /> },
  { label: 'Latency Score', key: 'avg_score_latency', render: (v: number) => <ScoreCell score={v} /> },
  { label: 'Jitter Score', key: 'avg_score_jitter', render: (v: number) => <ScoreCell score={v} /> },
  { label: 'WS Score', key: 'avg_score_ws', render: (v: number) => <ScoreCell score={v} /> },
  { label: 'Security Score', key: 'avg_score_security', render: (v: number) => <ScoreCell score={v} /> },
  { label: 'Uptime Ratio', key: 'avg_uptime_ratio', render: (v: number) => <span className="font-mono">{formatPercent(v)}</span> },
  { label: 'TTFB P95', key: 'avg_ttfb_p95_ms', render: (v: number) => <span className="font-mono">{formatMs(v)}</span> },
  { label: 'WS RTT', key: 'avg_ws_rtt_ms', render: (v: number) => <span className="font-mono">{formatMs(v)}</span> },
  { label: 'IP Clean', key: 'ip_clean_ratio', render: (v: number) => <span className="font-mono">{formatPercent(v)}</span> },
  { label: 'Geo Match', key: 'geo_match_ratio', render: (v: number) => <span className="font-mono">{formatPercent(v)}</span> },
  { label: 'Proxy Count', key: 'proxy_count', render: (v: number) => <span>{v}</span> },
  { label: 'Total Runs', key: 'total_runs', render: (v: number) => <span>{v}</span> },
] as const;

export function ComparisonTable({ data }: ComparisonTableProps) {
  if (data.length === 0) return null;

  if (process.env.NODE_ENV === 'development') {
    console.debug('[pages.compare] Comparison table rendered', {
      provider_count: data.length,
      providers: data.map(d => d.provider_name),
    });
  }

  return (
    <Card title="Detailed Comparison">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 text-gray-500 font-medium">Metric</th>
              {data.map((p) => (
                <th key={p.provider_id} className="text-left py-2 px-3 font-medium text-gray-900">
                  {p.provider_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric) => (
              <tr key={metric.key} className="border-b last:border-0">
                <td className="py-2 pr-4 text-gray-600">{metric.label}</td>
                {data.map((p) => (
                  <td key={p.provider_id} className="py-2 px-3">
                    {(metric.render as (v: never) => React.ReactNode)(
                      p[metric.key as keyof ProviderComparison] as never
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
