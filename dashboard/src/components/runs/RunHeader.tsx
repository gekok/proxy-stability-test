'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TestRun, formatDuration } from '@/types';
import { RunStatusBadge } from './RunStatusBadge';
import { StopTestButton } from './StopTestButton';
import { ExportButton } from './ExportButton';

interface RunHeaderProps {
  run: TestRun;
  onStop: () => Promise<void>;
}

export function RunHeader({ run, onStop }: RunHeaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (run.status !== 'running' || !run.started_at) return;
    const update = () => setElapsed(Date.now() - new Date(run.started_at!).getTime());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [run.status, run.started_at]);

  const duration = run.started_at
    ? run.finished_at
      ? formatDuration(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
      : formatDuration(elapsed)
    : '—';

  return (
    <div>
      <Link href="/runs" className="text-sm text-blue-600 hover:underline mb-2 inline-block">
        &larr; Back to Runs
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {run.proxy_label || run.proxy_id.slice(0, 8)}
          </h1>
          {run.provider_name && (
            <p className="text-sm text-gray-500">{run.provider_name}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <RunStatusBadge status={run.status} />
            <span className="text-sm text-gray-500">{duration}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton runId={run.id} disabled={run.status === 'pending'} />
          <StopTestButton run={run} onStop={onStop} />
        </div>
      </div>
    </div>
  );
}
