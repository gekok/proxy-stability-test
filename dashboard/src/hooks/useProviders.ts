'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Provider, ProviderCreate, ProviderUpdate } from '@/types';

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Provider[]>('/providers');
      setProviders(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch providers');
    } finally {
      setLoading(false);
    }
  }, []);

  const createProvider = useCallback(async (data: ProviderCreate) => {
    try {
      const res = await apiClient.post<Provider>('/providers', data);
      console.info('[providers] Provider created', { provider_name: data.name, module: 'pages.providers' });
      await fetchProviders();
      return res.data;
    } catch (err) {
      console.warn('[providers] Provider create fail', {
        provider_name: data.name,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.providers',
      });
      throw err;
    }
  }, [fetchProviders]);

  const updateProvider = useCallback(async (id: string, data: ProviderUpdate) => {
    try {
      const res = await apiClient.put<Provider>(`/providers/${id}`, data);
      console.info('[providers] Provider updated', {
        provider_id: id,
        provider_name: res.data.name,
        fields_changed: Object.keys(data),
        module: 'pages.providers',
      });
      await fetchProviders();
      return res.data;
    } catch (err) {
      console.warn('[providers] Provider update fail', {
        provider_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.providers',
      });
      throw err;
    }
  }, [fetchProviders]);

  const deleteProvider = useCallback(async (id: string, name: string) => {
    try {
      await apiClient.delete(`/providers/${id}`);
      console.info('[providers] Provider deleted', {
        provider_id: id, provider_name: name, module: 'pages.providers',
      });
      await fetchProviders();
    } catch (err) {
      console.error('[providers] Provider delete fail', {
        provider_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.providers',
      });
      throw err;
    }
  }, [fetchProviders]);

  return { providers, loading, error, fetchProviders, createProvider, updateProvider, deleteProvider };
}
