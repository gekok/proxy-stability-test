'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useRunDetail } from '@/hooks/useRunDetail';
import { usePolling } from '@/hooks/usePolling';
import { RunHeader } from '@/components/runs/RunHeader';
import { RunSummaryCards } from '@/components/runs/RunSummaryCards';
import { RunMetricsDetail } from '@/components/runs/RunMetricsDetail';
import { RunHttpSamples } from '@/components/runs/RunHttpSamples';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { run, summary, samples, loading, error, fetchRunDetail, stopRun, isActive } = useRunDetail(runId);
  const pollingStartedRef = useRef(false);

  useEffect(() => { fetchRunDetail(); }, [fetchRunDetail]);

  usePolling(fetchRunDetail, {
    interval: 3000,
    enabled: isActive,
    source: 'RunDetailPage',
  });

  useEffect(() => {
    if (isActive && !pollingStartedRef.current) {
      pollingStartedRef.current = true;
      if (process.env.NODE_ENV === 'development') {
        console.debug('Realtime polling started', { run_id: runId, interval_ms: 3000 });
      }
    }
    if (!isActive && pollingStartedRef.current) {
      pollingStartedRef.current = false;
      const reason = run?.status === 'completed' ? 'completed'
                   : run?.status === 'failed' ? 'failed' : 'unmount';
      if (process.env.NODE_ENV === 'development') {
        console.debug('Realtime polling stopped', { run_id: runId, reason });
      }
    }
  }, [isActive, runId, run?.status]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorAlert message={error} onRetry={fetchRunDetail} />;

  if (!run) {
    console.error('[runs] Page error', {
      page_path: `/runs/${runId}`,
      error_detail: 'Run not found',
      module: 'pages.runs',
    });
    return <ErrorAlert title="Run Not Found" message={`No test run with ID ${runId}`} />;
  }

  return (
    <div className="space-y-6">
      <RunHeader run={run} onStop={stopRun} />
      <RunSummaryCards summary={summary} />
      <RunMetricsDetail summary={summary} run={run} />
      <RunHttpSamples samples={samples} />
    </div>
  );
}
