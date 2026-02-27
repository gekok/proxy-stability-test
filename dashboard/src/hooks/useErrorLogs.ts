'use client';

import { useState, useCallback, useMemo } from 'react';
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

  const fetchErrorLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    const allEntries: ErrorLogEntry[] = [];

    // Fetch HTTP errors
    try {
      const httpRes = await apiClient.get<HttpSample[]>(`/runs/${runId}/http-samples`, { limit: '200' });
      const httpSamples = httpRes.data || [];
      const httpErrors = (Array.isArray(httpSamples) ? httpSamples : []).filter(
        (s: HttpSample) => s.error_type || (s.status_code && s.status_code >= 400)
      );
      for (const s of httpErrors) {
        allEntries.push({
          id: s.id,
          source: 'http',
          error_type: s.error_type || `http_${s.status_code}`,
          error_message: s.error_message || undefined,
          protocol: s.is_https ? 'https' : 'http',
          method: s.method,
          status_code: s.status_code || undefined,
          timing: {
            tcp_connect_ms: s.tcp_connect_ms || undefined,
            tls_handshake_ms: s.tls_handshake_ms || undefined,
            ttfb_ms: s.ttfb_ms || undefined,
            total_ms: s.total_ms || undefined,
          },
          seq: s.seq,
          measured_at: s.measured_at,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[pages.errors] Error logs fetch failed', { source: 'http', error_detail: msg });
    }

    // Fetch WS errors
    try {
      const wsRes = await apiClient.get<WsSample[]>(`/runs/${runId}/ws-samples`, { limit: '200' });
      const wsSamples = wsRes.data || [];
      const wsErrors = (Array.isArray(wsSamples) ? wsSamples : []).filter(
        (s: WsSample) => s.error_type || !s.connected
      );
      for (const s of wsErrors) {
        allEntries.push({
          id: s.id,
          source: 'ws',
          error_type: s.error_type || 'connection_failed',
          error_message: s.error_message || undefined,
          protocol: s.target_url?.startsWith('wss') ? 'wss' : 'ws',
          target_url: s.target_url,
          timing: {
            tcp_connect_ms: s.tcp_connect_ms || undefined,
            tls_handshake_ms: s.tls_handshake_ms || undefined,
            handshake_ms: s.handshake_ms || undefined,
            message_rtt_ms: s.message_rtt_ms || undefined,
          },
          seq: s.seq,
          measured_at: s.measured_at,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[pages.errors] Error logs fetch failed', { source: 'ws', error_detail: msg });
    }

    // Fetch IP issues
    try {
      const ipRes = await apiClient.get<IPCheckResult[]>(`/runs/${runId}/ip-checks`);
      const ipChecks = ipRes.data || [];
      const ipIssues = (Array.isArray(ipChecks) ? ipChecks : []).filter(
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
      console.error('[pages.errors] Error logs fetch failed', { source: 'ip', error_detail: msg });
    }

    // Sort by measured_at descending
    allEntries.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

    if (process.env.NODE_ENV === 'development') {
      const httpCount = allEntries.filter(e => e.source === 'http').length;
      const wsCount = allEntries.filter(e => e.source === 'ws').length;
      const ipCount = allEntries.filter(e => e.source === 'ip').length;
      console.debug('[pages.errors] Error logs loaded', {
        run_id: runId, http_errors: httpCount, ws_errors: wsCount, ip_issues: ipCount,
      });
    }

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
