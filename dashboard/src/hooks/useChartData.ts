'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { HttpSample, LatencyDataPoint, UptimeDataPoint } from '@/types';
import { bucketByTime, percentile, formatTime } from '@/components/charts/chart-utils';

const BUCKET_SIZE_MS = 60000; // 1 minute
const CHART_SAMPLE_LIMIT = 5000; // fetch many more samples for time-series charts

export function useChartData(runId: string, isActive: boolean) {
  const [allSamples, setAllSamples] = useState<HttpSample[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChartSamples = useCallback(async () => {
    try {
      const res = await apiClient.get<HttpSample[]>(
        `/runs/${runId}/http-samples`,
        { limit: String(CHART_SAMPLE_LIMIT), is_warmup: 'false' },
        { suppressNotFound: true },
      );
      setAllSamples((res.data || []) as HttpSample[]);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  }, [runId]);

  // Initial fetch + poll every 5s while active
  useEffect(() => {
    fetchChartSamples();
    if (!isActive) return;
    const timer = setInterval(fetchChartSamples, 5000);
    return () => clearInterval(timer);
  }, [fetchChartSamples, isActive]);

  const latencyData = useMemo((): LatencyDataPoint[] => {
    try {
      if (allSamples.length === 0) return [];

      const buckets = bucketByTime(allSamples, BUCKET_SIZE_MS);
      const result: LatencyDataPoint[] = [];

      Array.from(buckets.entries()).forEach(([timestamp, items]) => {
        const ttfbs = items
          .filter((s: HttpSample) => s.ttfb_ms != null && s.ttfb_ms > 0 && !s.error_type)
          .map((s: HttpSample) => s.ttfb_ms!)
          .sort((a: number, b: number) => a - b);

        if (ttfbs.length === 0) return;

        result.push({
          time: formatTime(timestamp),
          timestamp,
          p50: percentile(ttfbs, 50),
          p95: percentile(ttfbs, 95),
          p99: percentile(ttfbs, 99),
          sample_count: ttfbs.length,
        });
      });

      if (process.env.NODE_ENV === 'development' && result.length > 0) {
        console.debug('[charts.latency] Latency chart rendered', {
          data_points: result.length,
          total_samples: allSamples.length,
          latest_p95: result[result.length - 1]?.p95,
        });
      }

      return result;
    } catch (err) {
      console.error('[charts.data] Chart data aggregation failed', {
        hook: 'useChartData', fn_name: 'latencyData', error: err,
      });
      return [];
    }
  }, [allSamples]);

  const uptimeData = useMemo((): UptimeDataPoint[] => {
    try {
      if (allSamples.length === 0) return [];

      const buckets = bucketByTime(allSamples, BUCKET_SIZE_MS);
      const result: UptimeDataPoint[] = [];

      Array.from(buckets.entries()).forEach(([timestamp, items]) => {
        const success = items.filter((s: HttpSample) => !s.error_type && s.status_code != null && s.status_code < 400).length;
        const errorCount = items.length - success;
        const total = items.length;

        result.push({
          time: formatTime(timestamp),
          timestamp,
          success_count: success,
          error_count: errorCount,
          uptime_ratio: total > 0 ? success / total : 0,
          total,
        });
      });

      if (process.env.NODE_ENV === 'development' && result.length > 0) {
        console.debug('[charts.uptime] Uptime chart rendered', {
          data_points: result.length,
          total_samples: allSamples.length,
          latest_uptime: result[result.length - 1]?.uptime_ratio,
        });
      }

      return result;
    } catch (err) {
      console.error('[charts.data] Chart data aggregation failed', {
        hook: 'useChartData', fn_name: 'uptimeData', error: err,
      });
      return [];
    }
  }, [allSamples]);

  return { latencyData, uptimeData, loading };
}
