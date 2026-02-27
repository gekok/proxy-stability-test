'use client';

import { useState, useEffect } from 'react';
import { useProviders } from '@/hooks/useProviders';
import { useCompare } from '@/hooks/useCompare';
import { ProviderSelect } from '@/components/compare/ProviderSelect';
import { RadarCompareChart } from '@/components/compare/RadarCompareChart';
import { ComparisonTable } from '@/components/compare/ComparisonTable';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ComparePage() {
  const { providers, loading: providersLoading, error: providersError, fetchProviders } = useProviders();
  const { data, loading, error, compare } = useCompare();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    if (providersError) {
      console.error('[pages.compare] Provider list fetch failed', { error_detail: providersError });
    }
  }, [providersError]);

  const handleCompare = () => {
    if (selectedIds.length >= 2) {
      compare(selectedIds);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Provider Comparison</h1>

      {providersLoading ? (
        <LoadingSpinner />
      ) : providersError ? (
        <ErrorAlert message={providersError} onRetry={fetchProviders} />
      ) : (
        <div className="space-y-4">
          <ProviderSelect
            providers={providers}
            selected={selectedIds}
            onChange={setSelectedIds}
          />
          <Button
            onClick={handleCompare}
            disabled={selectedIds.length < 2 || loading}
          >
            {loading ? 'Comparing...' : 'Compare'}
          </Button>
        </div>
      )}

      {error && <ErrorAlert message={error} />}

      {data.length > 0 && (
        <div className="space-y-6">
          <ChartErrorBoundary title="Radar Chart">
            <RadarCompareChart data={data} />
          </ChartErrorBoundary>
          <ComparisonTable data={data} />
        </div>
      )}
    </div>
  );
}
