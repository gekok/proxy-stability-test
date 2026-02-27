'use client';

import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export function useExport() {
  const [downloading, setDownloading] = useState(false);

  const downloadExport = useCallback(async (runId: string, format: 'json' | 'csv') => {
    setDownloading(true);

    if (process.env.NODE_ENV === 'development') {
      console.debug('[pages.export] Export requested', { run_id: runId, format });
    }

    try {
      const response = await fetch(`${API_URL}/runs/${runId}/export?format=${format}`);
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();

      if (process.env.NODE_ENV === 'development') {
        console.debug('[pages.export] Export downloaded', { run_id: runId, format, blob_size: blob.size });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run-${runId.slice(0, 8)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[pages.export] Export failed', { run_id: runId, format, error_detail: msg });
      throw err;
    } finally {
      setDownloading(false);
    }
  }, []);

  return { downloadExport, downloading };
}
