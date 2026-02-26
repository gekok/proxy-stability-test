'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TestRun, formatDuration } from '@/types';

interface StopTestButtonProps {
  run: TestRun;
  onStop: () => Promise<void>;
}

export function StopTestButton({ run, onStop }: StopTestButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  if (run.status !== 'running' && run.status !== 'stopping') {
    return null;
  }

  const duration = run.started_at
    ? formatDuration(Date.now() - new Date(run.started_at).getTime())
    : 'unknown';

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onStop();
      setShowConfirm(false);
    } catch {
      // Error handled by hook
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="danger"
        onClick={() => setShowConfirm(true)}
        disabled={run.status === 'stopping'}
        loading={run.status === 'stopping'}
      >
        {run.status === 'stopping' ? 'Stopping...' : 'Stop Test'}
      </Button>

      <ConfirmDialog
        isOpen={showConfirm}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
        title="Stop Test"
        message={`Stop test for "${run.proxy_label || run.proxy_id.slice(0, 8)}"? Running for ${duration}.`}
        confirmLabel="Stop Test"
        variant="danger"
        loading={loading}
      />
    </>
  );
}
