'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Proxy, ProxyCreate, ProxyUpdate } from '@/types';

export function useProxies(providerId?: string) {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProxies = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (providerId) params.provider_id = providerId;
      const res = await apiClient.get<Proxy[]>('/proxies', params);
      setProxies(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proxies');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const createProxy = useCallback(async (data: ProxyCreate) => {
    try {
      const res = await apiClient.post<Proxy>('/proxies', data);
      console.info('[proxies] Proxy created', {
        proxy_label: data.label,
        provider_id: data.provider_id,
        module: 'pages.proxies',
      });
      await fetchProxies();
      return res.data;
    } catch (err) {
      console.warn('[proxies] Proxy create fail', {
        proxy_label: data.label,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.proxies',
      });
      throw err;
    }
  }, [fetchProxies]);

  const updateProxy = useCallback(async (id: string, label: string, data: ProxyUpdate) => {
    try {
      const res = await apiClient.put<Proxy>(`/proxies/${id}`, data);
      const passwordChanged = data.auth_pass !== undefined && data.auth_pass !== '';
      console.info('[proxies] Proxy updated', {
        proxy_id: id,
        proxy_label: label,
        fields_changed: Object.keys(data).filter(k => k !== 'auth_pass'),
        password_changed: passwordChanged,
        module: 'pages.proxies',
      });
      await fetchProxies();
      return res.data;
    } catch (err) {
      console.warn('[proxies] Proxy update fail', {
        proxy_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.proxies',
      });
      throw err;
    }
  }, [fetchProxies]);

  const deleteProxy = useCallback(async (id: string, label: string, providerName: string) => {
    try {
      await apiClient.delete(`/proxies/${id}`);
      console.info('[proxies] Proxy deleted', {
        proxy_id: id, proxy_label: label, provider_name: providerName,
        module: 'pages.proxies',
      });
      await fetchProxies();
    } catch (err) {
      console.error('[proxies] Proxy delete fail', {
        proxy_id: id,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.proxies',
      });
      throw err;
    }
  }, [fetchProxies]);

  return { proxies, loading, error, fetchProxies, createProxy, updateProxy, deleteProxy };
}
