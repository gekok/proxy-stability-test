'use client';

import { Card } from '@/components/ui/Card';
import { RunSummary, getScoreColor, getScoreGrade } from '@/types';

interface RunScoreBreakdownProps {
  summary: RunSummary | null;
}

interface ScoreBarProps {
  label: string;
  score: number | null | undefined;
  weight: string;
  color: string;
}

function ScoreBar({ label, score, weight, color }: ScoreBarProps) {
  const pct = score != null ? Math.round(score * 100) : 0;
  const scoreColor = score != null ? getScoreColor(score) : null;
  const textClass = scoreColor === 'good' ? 'text-green-600' : scoreColor === 'warning' ? 'text-yellow-600' : scoreColor === 'bad' ? 'text-red-600' : 'text-gray-400';

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-sm text-gray-700 font-medium">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        {score != null && (
          <div
            className={`h-full rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className={`w-14 text-right font-mono text-sm font-semibold ${textClass}`}>
        {score != null ? score.toFixed(3) : '—'}
      </div>
      <div className="w-12 text-right text-xs text-gray-400">{weight}</div>
    </div>
  );
}

export function RunScoreBreakdown({ summary }: RunScoreBreakdownProps) {
  if (process.env.NODE_ENV === 'development' && summary) {
    console.debug('Score breakdown loaded', {
      module: 'pages.runs',
      run_id: summary.run_id,
      score_total: summary.score_total,
      components: {
        uptime: summary.score_uptime,
        latency: summary.score_latency,
        jitter: summary.score_jitter,
        ws: summary.score_ws,
        security: summary.score_security,
      },
    });
  }

  if (!summary) {
    return (
      <Card title="Score Breakdown">
        <p className="text-sm text-gray-500">Waiting for first summary data...</p>
      </Card>
    );
  }

  const hasWS = summary.ws_sample_count > 0;
  const hasSecurity = summary.score_security != null && summary.score_security > 0;

  // Determine effective weights
  let wU = 25, wL = 25, wJ = 15, wW = 15, wS = 20;
  if (!hasWS && !hasSecurity) {
    wU = 38.5; wL = 38.5; wJ = 23; wW = 0; wS = 0;
  } else if (!hasWS) {
    wU = 29.4; wL = 29.4; wJ = 17.6; wW = 0; wS = 23.5;
  } else if (!hasSecurity) {
    wU = 31.3; wL = 31.3; wJ = 18.8; wW = 18.8; wS = 0;
  }

  const grade = summary.score_total != null ? getScoreGrade(summary.score_total) : null;
  const gradeColor = summary.score_total != null ? getScoreColor(summary.score_total) : null;
  const gradeClass = gradeColor === 'good' ? 'text-green-600' : gradeColor === 'warning' ? 'text-yellow-600' : gradeColor === 'bad' ? 'text-red-600' : 'text-gray-400';

  return (
    <Card title="Score Breakdown">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-sm text-gray-500">Total Score:</span>
        <span className={`text-2xl font-bold font-mono ${gradeClass}`}>
          {summary.score_total != null ? summary.score_total.toFixed(3) : '—'}
        </span>
        {grade && (
          <span className={`text-lg font-bold ${gradeClass}`}>
            ({grade})
          </span>
        )}
      </div>

      <div className="space-y-2">
        <ScoreBar label="Uptime" score={summary.score_uptime} weight={`${wU}%`} color="bg-blue-500" />
        <ScoreBar label="Latency" score={summary.score_latency} weight={`${wL}%`} color="bg-green-500" />
        <ScoreBar label="Jitter" score={summary.score_jitter} weight={`${wJ}%`} color="bg-yellow-500" />
        {(hasWS || wW > 0) && (
          <ScoreBar label="WebSocket" score={summary.score_ws} weight={`${wW}%`} color="bg-purple-500" />
        )}
        {(hasSecurity || wS > 0) && (
          <ScoreBar label="Security" score={summary.score_security} weight={`${wS}%`} color="bg-red-500" />
        )}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        {hasWS && hasSecurity
          ? '5-component scoring: Uptime, Latency, Jitter, WebSocket, Security'
          : hasWS
          ? '4-component scoring: WS active, Security skipped'
          : hasSecurity
          ? '4-component scoring: WS skipped, Security active'
          : '3-component scoring: WS + Security not available'}
      </p>
    </Card>
  );
}
