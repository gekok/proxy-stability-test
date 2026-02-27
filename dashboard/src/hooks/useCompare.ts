'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProviderComparison } from '@/types';

export function useCompare() {
  const [data, setData] = useState<ProviderComparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (providerIds: string[]) => {
    setLoading(true);
    setError(null);

    if (process.env.NODE_ENV === 'development') {
      console.debug('[pages.compare] Compare requested', { provider_count: providerIds.length });
    }

    try {
      const res = await apiClient.get<ProviderComparison[]>(
        '/providers/compare',
        { provider_ids: providerIds.join(',') },
      );
      const result = res.data || [];

      if (process.env.NODE_ENV === 'development') {
        console.debug('[pages.compare] Compare loaded', {
          provider_count: result.length,
          providers: result.map(p => p.provider_name),
        });
      }

      setData(Array.isArray(result) ? result : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[pages.compare] Compare error', { error_detail: msg });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, compare };
}
