'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { TestRun, RunSummary, HttpSample } from '@/types';

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
      const [runRes, summaryRes, samplesRes] = await Promise.all([
        apiClient.get<TestRun>(`/runs/${runId}`),
        apiClient.get<RunSummary>(`/runs/${runId}/summary`, undefined, { suppressNotFound: true })
          .catch((err) => {
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

      if (summaryRes.data && !firstSummaryReceivedRef.current) {
        firstSummaryReceivedRef.current = true;
        const s = summaryRes.data as RunSummary;
        if (process.env.NODE_ENV === 'development') {
          console.info('First summary received', {
            run_id: runId,
            score_total: s.score_total,
            total_samples: s.http_sample_count + s.https_sample_count,
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

      console.info('[runs] Test stopped', {
        run_id: runId,
        proxy_label: run?.proxy_label,
        stopped_by: 'user',
        running_for_ms,
        module: 'pages.runs',
      });

      await fetchRunDetail();
    } catch (err) {
      console.error('[runs] Test stop fail', {
        run_id: runId,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.runs',
      });
      throw err;
    }
  }, [runId, run, fetchRunDetail]);

  const isActive = run?.status === 'running' || run?.status === 'stopping';

  return { run, summary, samples, loading, error, fetchRunDetail, stopRun, isActive };
}
