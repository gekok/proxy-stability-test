'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions {
  interval: number;
  enabled: boolean;
  source?: string;
}

export function usePolling(
  fetchFn: () => Promise<void>,
  options: UsePollingOptions
) {
  const { interval, enabled, source = 'unknown' } = options;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const previousEnabledRef = useRef(enabled);

  const executePoll = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      await fetchFn();
      if (process.env.NODE_ENV === 'development') {
        console.debug('[poll] success', { interval, source });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[poll] fail', {
          error: error instanceof Error ? error.message : String(error),
          source,
        });
      }
    }
  }, [fetchFn, interval, source]);

  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[poll] started', { interval, source });
      }

      if (!previousEnabledRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[poll] resumed', { interval, source });
        }
      }

      executePoll();
      intervalRef.current = setInterval(executePoll, interval);
    } else {
      if (previousEnabledRef.current && process.env.NODE_ENV === 'development') {
        console.debug('[poll] paused', { reason: 'enabled=false', source });
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    previousEnabledRef.current = enabled;

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (process.env.NODE_ENV === 'development') {
        console.debug('[poll] cleanup', { reason: 'unmount', source });
      }
    };
  }, [enabled, interval, executePoll, source]);
}
