'use client';

import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { TestRun, RunSummary, HttpSample, WsSample, IPCheckResult } from '@/types';

export function useRunDetail(runId: string, activeTab?: string) {
  const [run, setRun] = useState<TestRun | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [samples, setSamples] = useState<HttpSample[]>([]);
  const [wsSamples, setWsSamples] = useState<WsSample[]>([]);
  const [ipChecks, setIpChecks] = useState<IPCheckResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  const firstSummaryReceivedRef = useRef(false);

  const fetchRunDetail = useCallback(async () => {
    try {
      // Determine which tab-specific data to fetch
      const fetchAll = !activeTab;
      const needHttp = fetchAll || activeTab === 'http' || activeTab === 'charts' || activeTab === 'errors';
      const needWs = fetchAll || activeTab === 'ws' || activeTab === 'errors';
      const needIp = fetchAll || activeTab === 'ip' || activeTab === 'errors';

      // Always fetch run + summary (needed for header/cards)
      const runPromise = apiClient.get<TestRun>(`/runs/${runId}`);
      const summaryPromise = apiClient.get<RunSummary>(`/runs/${runId}/summary`, undefined, { suppressNotFound: true })
        .catch((err) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Run summary fetch failed', {
              run_id: runId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          return { data: null };
        });

      // Conditionally fetch tab-specific data
      const httpPromise = needHttp
        ? apiClient.get<HttpSample[]>(`/runs/${runId}/http-samples`, { limit: '50' }, { suppressNotFound: true })
            .catch((err) => {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Run samples fetch failed', {
                  run_id: runId,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
              return { data: [] };
            })
        : null;

      const wsPromise = needWs
        ? apiClient.get<WsSample[]>(`/runs/${runId}/ws-samples`, { limit: '50' }, { suppressNotFound: true })
            .catch(() => ({ data: [] }))
        : null;

      const ipPromise = needIp
        ? apiClient.get<IPCheckResult[]>(`/runs/${runId}/ip-checks`, undefined, { suppressNotFound: true })
            .catch(() => ({ data: [] }))
        : null;

      const [runRes, summaryRes, samplesRes, wsRes, ipRes] = await Promise.all([
        runPromise,
        summaryPromise,
        httpPromise,
        wsPromise,
        ipPromise,
      ]);

      const newRun = runRes.data;
      setRun(newRun);
      setSummary(summaryRes.data as RunSummary | null);

      // Only update tab-specific state when we actually fetched it
      if (samplesRes) setSamples((samplesRes.data || []) as HttpSample[]);
      if (wsRes) setWsSamples((wsRes.data || []) as WsSample[]);
      if (ipRes) setIpChecks((ipRes.data || []) as IPCheckResult[]);

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
  }, [runId, activeTab]);

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

  return { run, summary, samples, wsSamples, ipChecks, loading, error, fetchRunDetail, stopRun, isActive };
}
