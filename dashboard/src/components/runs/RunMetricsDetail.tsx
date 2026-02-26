'use client';

import { Card } from '@/components/ui/Card';
import { RunSummary, TestRun, getScoreColor } from '@/types';

interface RunMetricsDetailProps {
  summary: RunSummary | null;
  run: TestRun;
}

function formatMs(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${Math.round(val)} ms`;
}

function formatRatio(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function ScoreCell({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-gray-400">—</span>;
  const color = getScoreColor(score);
  const cls = color === 'good' ? 'text-green-600' : color === 'warning' ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-mono font-semibold ${cls}`}>{score.toFixed(3)}</span>;
}

export function RunMetricsDetail({ summary, run }: RunMetricsDetailProps) {
  if (!summary) {
    return (
      <Card title="Metrics">
        <p className="text-sm text-gray-500">Waiting for first summary data...</p>
      </Card>
    );
  }

  const httpTotal = summary.http_sample_count;
  const httpsTotal = summary.https_sample_count;
  const httpSuccessRatio = httpTotal > 0 ? summary.http_success_count / httpTotal : null;
  const httpsSuccessRatio = httpsTotal > 0
    ? (httpTotal > 0
      ? (summary.http_success_count - (summary.http_error_count || 0)) / httpsTotal
      : null)
    : null;

  return (
    <div className="space-y-4">
      <Card title="Latency Percentiles">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-6 py-1">Metric</th>
                <th className="pr-6 py-1">P50</th>
                <th className="pr-6 py-1">P95</th>
                <th className="pr-6 py-1">P99</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                <td className="pr-6 py-1 text-gray-700">TTFB</td>
                <td className="pr-6 py-1">{formatMs(summary.ttfb_p50_ms)}</td>
                <td className="pr-6 py-1">{formatMs(summary.ttfb_p95_ms)}</td>
                <td className="pr-6 py-1">{formatMs(summary.ttfb_p99_ms)}</td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">TLS Handshake</td>
                <td className="pr-6 py-1">{formatMs(summary.tls_p50_ms)}</td>
                <td className="pr-6 py-1">{formatMs(summary.tls_p95_ms)}</td>
                <td className="pr-6 py-1">{formatMs(summary.tls_p99_ms)}</td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">TCP Connect</td>
                <td className="pr-6 py-1">{formatMs(summary.tcp_connect_p50_ms)}</td>
                <td className="pr-6 py-1">{formatMs(summary.tcp_connect_p95_ms)}</td>
                <td className="pr-6 py-1">{formatMs(summary.tcp_connect_p99_ms)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Protocol Breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-6 py-1">Protocol</th>
                <th className="pr-6 py-1">Success Rate</th>
                <th className="pr-6 py-1">Samples</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                <td className="pr-6 py-1 text-gray-700">HTTP</td>
                <td className="pr-6 py-1">{formatRatio(httpSuccessRatio)}</td>
                <td className="pr-6 py-1">{httpTotal}</td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">HTTPS</td>
                <td className="pr-6 py-1">{formatRatio(httpsSuccessRatio)}</td>
                <td className="pr-6 py-1">{httpsTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Scoring Breakdown">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-6 py-1">Component</th>
                <th className="pr-6 py-1">Weight</th>
                <th className="pr-6 py-1">Score</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-6 py-1 text-gray-700">Uptime</td>
                <td className="pr-6 py-1 text-gray-500">38.5%</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_uptime} /></td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">Latency</td>
                <td className="pr-6 py-1 text-gray-500">38.5%</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_latency} /></td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">Jitter</td>
                <td className="pr-6 py-1 text-gray-500">23.0%</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_jitter} /></td>
              </tr>
              <tr className="border-t font-semibold">
                <td className="pr-6 py-1 text-gray-900">Total</td>
                <td className="pr-6 py-1 text-gray-500">100%</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_total} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Sprint 2: 3 components (Uptime, Latency, Jitter). WS + Security added in Sprint 3.
        </p>
      </Card>
    </div>
  );
}
