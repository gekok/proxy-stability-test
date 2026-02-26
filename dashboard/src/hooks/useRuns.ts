'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { TestRun, RunStatus } from '@/types';

export function useRuns(statusFilter?: RunStatus) {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await apiClient.get<TestRun[]>('/runs', params);
      setRuns(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const hasActiveRuns = runs.some(r => r.status === 'running' || r.status === 'stopping');

  return { runs, loading, error, fetchRuns, hasActiveRuns };
}
