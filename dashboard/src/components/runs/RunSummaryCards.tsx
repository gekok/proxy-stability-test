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

  const colorClass = (color: string | null) => {
    if (!color) return 'text-gray-400';
    return color === 'good' ? 'text-green-600' : color === 'warning' ? 'text-yellow-600' : 'text-red-600';
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
