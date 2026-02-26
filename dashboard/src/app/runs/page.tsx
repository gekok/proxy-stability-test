'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useRuns } from '@/hooks/useRuns';
import { usePolling } from '@/hooks/usePolling';
import { RunsList } from '@/components/runs/RunsList';
import { RunsFilter } from '@/components/runs/RunsFilter';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { RunStatus } from '@/types';

function RunsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusFilter = searchParams.get('status') as RunStatus | null;
  const { runs, loading, error, fetchRuns, hasActiveRuns } = useRuns(statusFilter || undefined);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  usePolling(fetchRuns, {
    interval: 5000,
    enabled: hasActiveRuns,
    source: 'RunsPage',
  });

  const handleStatusChange = (status: RunStatus | null) => {
    if (status) {
      router.push(`/runs?status=${status}`);
    } else {
      router.push('/runs');
    }
  };

  if (loading && runs.length === 0) return <LoadingSpinner size="lg" />;

  if (error) {
    console.error('[runs] Page error', { page_path: '/runs', error_detail: error, module: 'pages.runs' });
    return <ErrorAlert message={error} onRetry={fetchRuns} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Test Runs</h1>
      </div>

      <RunsFilter currentStatus={statusFilter} onStatusChange={handleStatusChange} />

      {runs.length === 0 ? (
        <EmptyState
          title="No test runs yet"
          description={statusFilter ? `No runs with status "${statusFilter}".` : 'Start a test from the Providers page.'}
        />
      ) : (
        <RunsList runs={runs} loading={loading} />
      )}
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <RunsPageContent />
    </Suspense>
  );
}
