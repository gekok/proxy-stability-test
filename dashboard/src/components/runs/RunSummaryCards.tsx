'use client';

import { Card } from '@/components/ui/Card';
import { RunSummary, getScoreColor, getScoreGrade } from '@/types';

interface RunSummaryCardsProps {
  summary: RunSummary | null;
}

export function RunSummaryCards({ summary }: RunSummaryCardsProps) {
  const scoreColor = summary?.score_total != null ? getScoreColor(summary.score_total) : null;
  const scoreGrade = summary?.score_total != null ? getScoreGrade(summary.score_total) : null;

  const latencyColor = summary?.ttfb_p95_ms != null
    ? summary.ttfb_p95_ms <= 200 ? 'good' : summary.ttfb_p95_ms <= 500 ? 'warning' : 'bad'
    : null;

  const uptimeColor = summary?.uptime_ratio != null
    ? summary.uptime_ratio >= 0.95 ? 'good' : summary.uptime_ratio >= 0.9 ? 'warning' : 'bad'
    : null;

  const totalSamples = summary
    ? summary.http_sample_count + summary.https_sample_count
    : 0;

  const wsRttColor = summary?.ws_rtt_avg_ms != null
    ? summary.ws_rtt_avg_ms <= 100 ? 'good' : summary.ws_rtt_avg_ms <= 300 ? 'warning' : 'bad'
    : null;

  const colorClass = (color: string | null) => {
    if (!color) return 'text-gray-400';
    return color === 'good' ? 'text-green-600' : color === 'warning' ? 'text-yellow-600' : 'text-red-600';
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <Card>
        <div className="text-sm text-gray-500">Score</div>
        <div className={`text-3xl font-bold font-mono ${colorClass(scoreColor)}`}>
          {summary?.score_total != null ? summary.score_total.toFixed(3) : '—'}
        </div>
        {scoreGrade && (
          <div className={`text-sm font-semibold ${colorClass(scoreColor)}`}>
            Grade {scoreGrade}
          </div>
        )}
      </Card>

      <Card>
        <div className="text-sm text-gray-500">Latency P95</div>
        <div className={`text-3xl font-bold font-mono ${colorClass(latencyColor)}`}>
          {summary?.ttfb_p95_ms != null ? `${Math.round(summary.ttfb_p95_ms)} ms` : '—'}
        </div>
      </Card>

      <Card>
        <div className="text-sm text-gray-500">Uptime</div>
        <div className={`text-3xl font-bold font-mono ${colorClass(uptimeColor)}`}>
          {summary?.uptime_ratio != null ? `${(summary.uptime_ratio * 100).toFixed(1)}%` : '—'}
        </div>
      </Card>

      <Card>
        <div className="text-sm text-gray-500">Samples</div>
        <div className="text-3xl font-bold font-mono text-gray-900">
          {summary ? totalSamples.toLocaleString() : '—'}
        </div>
      </Card>

      <Card>
        <div className="text-sm text-gray-500">WS RTT</div>
        <div className={`text-3xl font-bold font-mono ${colorClass(wsRttColor)}`}>
          {summary?.ws_rtt_avg_ms != null ? `${Math.round(summary.ws_rtt_avg_ms)} ms` : '—'}
        </div>
        {summary?.ws_drop_rate != null && (
          <div className="text-xs text-gray-500">
            Drop rate: {(summary.ws_drop_rate * 100).toFixed(1)}%
          </div>
        )}
      </Card>

      <Card>
        <div className="text-sm text-gray-500">IP Status</div>
        <div className="text-xl font-bold font-mono">
          {summary?.ip_clean != null ? (
            <span className={summary.ip_clean ? 'text-green-600' : 'text-red-600'}>
              {summary.ip_clean ? 'Clean' : 'Listed'}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
        {summary?.ip_geo_match != null && (
          <div className={`text-xs ${summary.ip_geo_match ? 'text-green-600' : 'text-yellow-600'}`}>
            Geo: {summary.ip_geo_match ? 'Match' : 'Mismatch'}
          </div>
        )}
      </Card>
    </div>
  );
}
