'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { ErrorLogEntry, ErrorLogFilterState, HttpSample, WsSample, IPCheckResult } from '@/types';

export function useErrorLogs(runId: string) {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ErrorLogFilterState>({
    source: 'all',
    error_type: '',
    protocol: '',
  });
  const hasFetchedRef = useRef(false);

  const fetchErrorLogs = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    const allEntries: ErrorLogEntry[] = [];

    // Fetch HTTP errors
    try {
      const httpRes = await apiClient.get<HttpSample[]>(`/runs/${runId}/http-samples`, { limit: '5000' });
      const httpSamples = Array.isArray(httpRes.data) ? httpRes.data : [];
      const httpErrors = httpSamples.filter(
        (s: HttpSample) => s.error_type || (s.status_code != null && s.status_code >= 400)
      );
      for (const s of httpErrors) {
        allEntries.push({
          id: s.id,
          source: 'http',
          error_type: s.error_type ?? `http_${s.status_code}`,
          error_message: s.error_message ?? undefined,
          protocol: s.is_https ? 'https' : 'http',
          method: s.method,
          status_code: s.status_code ?? undefined,
          timing: {
            tcp_connect_ms: s.tcp_connect_ms ?? undefined,
            tls_handshake_ms: s.tls_handshake_ms ?? undefined,
            ttfb_ms: s.ttfb_ms ?? undefined,
            total_ms: s.total_ms ?? undefined,
          },
          seq: s.seq,
          measured_at: s.measured_at,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[errors] HTTP error logs fetch failed:', msg);
    }

    // Fetch WS errors
    try {
      const wsRes = await apiClient.get<WsSample[]>(`/runs/${runId}/ws-samples`, { limit: '5000' });
      const wsSamples = Array.isArray(wsRes.data) ? wsRes.data : [];
      const wsErrors = wsSamples.filter(
        (s: WsSample) => s.error_type || !s.connected
      );
      for (const s of wsErrors) {
        allEntries.push({
          id: s.id,
          source: 'ws',
          error_type: s.error_type ?? 'connection_failed',
          error_message: s.error_message ?? undefined,
          protocol: s.target_url?.startsWith('wss') ? 'wss' : 'ws',
          target_url: s.target_url,
          timing: {
            tcp_connect_ms: s.tcp_connect_ms ?? undefined,
            tls_handshake_ms: s.tls_handshake_ms ?? undefined,
            handshake_ms: s.handshake_ms ?? undefined,
            message_rtt_ms: s.message_rtt_ms ?? undefined,
          },
          seq: s.seq,
          measured_at: s.measured_at,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[errors] WS error logs fetch failed:', msg);
    }

    // Fetch IP issues
    try {
      const ipRes = await apiClient.get<IPCheckResult[]>(`/runs/${runId}/ip-checks`);
      const ipChecks = Array.isArray(ipRes.data) ? ipRes.data : [];
      const ipIssues = ipChecks.filter(
        (s: IPCheckResult) => !s.is_clean || !s.geo_match
      );
      for (const s of ipIssues) {
        allEntries.push({
          id: s.id,
          source: 'ip',
          error_type: !s.is_clean ? 'ip_blacklisted' : 'geo_mismatch',
          error_message: !s.is_clean
            ? `Listed on ${s.blacklists_listed}/${s.blacklists_queried} blacklists`
            : `Expected ${s.expected_country}, got ${s.actual_country}`,
          measured_at: s.checked_at,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[errors] IP error logs fetch failed:', msg);
    }

    // Sort by measured_at descending
    allEntries.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

    console.log('[errors] Error logs loaded:', {
      run_id: runId, total: allEntries.length,
      http: allEntries.filter(e => e.source === 'http').length,
      ws: allEntries.filter(e => e.source === 'ws').length,
      ip: allEntries.filter(e => e.source === 'ip').length,
    });

    hasFetchedRef.current = true;
    setEntries(allEntries);
    setLoading(false);
  }, [runId]);

  const filtered = useMemo(() => {
    let result = entries;
    if (filters.source !== 'all') {
      result = result.filter(e => e.source === filters.source);
    }
    if (filters.error_type) {
      result = result.filter(e => e.error_type === filters.error_type);
    }
    if (filters.protocol) {
      result = result.filter(e => e.protocol === filters.protocol);
    }
    return result;
  }, [entries, filters]);

  const updateFilter = useCallback((key: keyof ErrorLogFilterState, value: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[pages.errors] Error log filter changed', { filter_key: key, filter_value: value });
    }
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const errorTypes = useMemo(() => {
    const types = new Set(entries.map(e => e.error_type));
    return Array.from(types).sort();
  }, [entries]);

  return { entries: filtered, allEntries: entries, loading, error, filters, updateFilter, errorTypes, fetchErrorLogs };
}
