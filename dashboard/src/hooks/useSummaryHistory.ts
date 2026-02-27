'use client';

import { useRef, useMemo } from 'react';
import { RunSummary, SummarySnapshot, getScoreGrade } from '@/types';
import { formatTime } from '@/components/charts/chart-utils';

const MAX_SNAPSHOTS = 200;
const DEDUP_THRESHOLD_MS = 5000;

export function useSummaryHistory(summary: RunSummary | null): SummarySnapshot[] {
  const historyRef = useRef<SummarySnapshot[]>([]);

  const snapshots = useMemo(() => {
    if (!summary || summary.score_total == null) return historyRef.current;

    const now = Date.now();
    const history = historyRef.current;

    // Dedup: skip if same score within threshold
    if (history.length > 0) {
      const last = history[history.length - 1];
      if (
        Math.abs(now - last.timestamp) < DEDUP_THRESHOLD_MS &&
        Math.abs(summary.score_total - last.score_total) < 0.0001
      ) {
        return history;
      }
    }

    const snapshot: SummarySnapshot = {
      timestamp: now,
      time: formatTime(now),
      score_total: summary.score_total,
      grade: getScoreGrade(summary.score_total),
      score_uptime: summary.score_uptime || 0,
      score_latency: summary.score_latency || 0,
      score_jitter: summary.score_jitter || 0,
      score_ws: summary.score_ws || undefined,
      score_security: summary.score_security || undefined,
      uptime_ratio: summary.uptime_ratio || 0,
    };

    const newHistory = [...history, snapshot];
    if (newHistory.length > MAX_SNAPSHOTS) {
      newHistory.splice(0, newHistory.length - MAX_SNAPSHOTS);
    }

    historyRef.current = newHistory;

    if (process.env.NODE_ENV === 'development') {
      console.debug('[charts.score_history] Score history snapshot', {
        history_length: newHistory.length,
        latest_score: snapshot.score_total,
        latest_grade: snapshot.grade,
      });
    }

    return newHistory;
  }, [summary]);

  return snapshots;
}
