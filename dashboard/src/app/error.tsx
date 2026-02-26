'use client';

import { useEffect } from 'react';
import { ErrorAlert } from '@/components/ui/ErrorAlert';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary] Page error', {
      page_path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      error_detail: error.message,
      error_digest: error.digest,
      module: 'pages.error-boundary',
    });
  }, [error]);

  return (
    <ErrorAlert
      title="Something went wrong"
      message={error.message}
      onRetry={reset}
    />
  );
}
