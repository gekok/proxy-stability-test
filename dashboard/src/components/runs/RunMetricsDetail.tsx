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
  const totalHTTPSamples = httpTotal + httpsTotal;
  // Note: http_success_count / http_error_count are combined totals (HTTP + HTTPS),
  // not per-protocol. We can only compute overall success rate.
  const overallSuccessRatio = totalHTTPSamples > 0
    ? summary.http_success_count / totalHTTPSamples
    : null;

  const hasWS = summary.ws_sample_count > 0;
  const hasSecurity = summary.score_security != null && summary.score_security > 0;

  // Determine effective weights
  let wU = '25%', wL = '25%', wJ = '15%', wW = '15%', wS = '20%';
  if (!hasWS && !hasSecurity) {
    wU = '38.5%'; wL = '38.5%'; wJ = '23.0%'; wW = '—'; wS = '—';
  } else if (!hasWS) {
    wU = '29.4%'; wL = '29.4%'; wJ = '17.6%'; wW = '—'; wS = '23.5%';
  } else if (!hasSecurity) {
    wU = '31.3%'; wL = '31.3%'; wJ = '18.8%'; wW = '18.8%'; wS = '—';
  }

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
              {summary.majority_tls_version && (
                <tr>
                  <td className="pr-6 py-1 text-gray-700">TLS Version</td>
                  <td className="pr-6 py-1 font-mono" colSpan={2}>{summary.majority_tls_version}</td>
                  <td className="pr-6 py-1">
                    {summary.tls_version_score != null && (
                      <span className={`font-mono font-semibold ${
                        summary.tls_version_score >= 0.9 ? 'text-green-600' :
                        summary.tls_version_score >= 0.6 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {summary.tls_version_score.toFixed(1)}
                      </span>
                    )}
                  </td>
                </tr>
              )}
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
                <th className="pr-6 py-1">Samples</th>
                <th className="pr-6 py-1">Success Rate</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                <td className="pr-6 py-1 text-gray-700">HTTP</td>
                <td className="pr-6 py-1">{httpTotal}</td>
                <td className="pr-6 py-1 text-gray-400" rowSpan={2}></td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">HTTPS</td>
                <td className="pr-6 py-1">{httpsTotal}</td>
              </tr>
              {hasWS && (
                <tr>
                  <td className="pr-6 py-1 text-gray-700">WebSocket</td>
                  <td className="pr-6 py-1">{summary.ws_sample_count}</td>
                  <td className="pr-6 py-1">
                    {summary.ws_success_count + summary.ws_error_count > 0
                      ? formatRatio(summary.ws_success_count / (summary.ws_success_count + summary.ws_error_count))
                      : '—'}
                  </td>
                </tr>
              )}
              <tr className="border-t font-medium">
                <td className="pr-6 py-1 text-gray-900">Overall</td>
                <td className="pr-6 py-1">{totalHTTPSamples + (hasWS ? summary.ws_sample_count : 0)}</td>
                <td className="pr-6 py-1">{formatRatio(overallSuccessRatio)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {hasWS && (
        <Card title="WebSocket Metrics">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pr-6 py-1">Metric</th>
                  <th className="pr-6 py-1">Value</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr>
                  <td className="pr-6 py-1 text-gray-700">RTT Average</td>
                  <td className="pr-6 py-1">{formatMs(summary.ws_rtt_avg_ms)}</td>
                </tr>
                <tr>
                  <td className="pr-6 py-1 text-gray-700">RTT P95</td>
                  <td className="pr-6 py-1">{formatMs(summary.ws_rtt_p95_ms)}</td>
                </tr>
                <tr>
                  <td className="pr-6 py-1 text-gray-700">Drop Rate</td>
                  <td className="pr-6 py-1">{formatRatio(summary.ws_drop_rate)}</td>
                </tr>
                <tr>
                  <td className="pr-6 py-1 text-gray-700">Avg Hold Duration</td>
                  <td className="pr-6 py-1">
                    {summary.ws_avg_hold_ms != null ? `${(summary.ws_avg_hold_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
                <td className="pr-6 py-1 text-gray-500">{wU}</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_uptime} /></td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">Latency</td>
                <td className="pr-6 py-1 text-gray-500">{wL}</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_latency} /></td>
              </tr>
              <tr>
                <td className="pr-6 py-1 text-gray-700">Jitter</td>
                <td className="pr-6 py-1 text-gray-500">{wJ}</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_jitter} /></td>
              </tr>
              {(hasWS || wW !== '—') && (
                <tr>
                  <td className="pr-6 py-1 text-gray-700">WebSocket</td>
                  <td className="pr-6 py-1 text-gray-500">{wW}</td>
                  <td className="pr-6 py-1"><ScoreCell score={summary.score_ws} /></td>
                </tr>
              )}
              {(hasSecurity || wS !== '—') && (
                <tr>
                  <td className="pr-6 py-1 text-gray-700">Security</td>
                  <td className="pr-6 py-1 text-gray-500">{wS}</td>
                  <td className="pr-6 py-1"><ScoreCell score={summary.score_security} /></td>
                </tr>
              )}
              <tr className="border-t font-semibold">
                <td className="pr-6 py-1 text-gray-900">Total</td>
                <td className="pr-6 py-1 text-gray-500">100%</td>
                <td className="pr-6 py-1"><ScoreCell score={summary.score_total} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
