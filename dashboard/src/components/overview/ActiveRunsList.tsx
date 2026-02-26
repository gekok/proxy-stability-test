'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { RunStatusBadge } from '@/components/runs/RunStatusBadge';
import { TestRun, formatDuration } from '@/types';

interface ActiveRunsListProps {
  runs: TestRun[];
}

export function ActiveRunsList({ runs }: ActiveRunsListProps) {
  if (runs.length === 0) {
    return (
      <Card title="Active Tests">
        <p className="text-sm text-gray-500 text-center py-4">
          No active tests running.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Active Tests">
      <div className="space-y-3">
        {runs.map((run) => {
          const duration = run.started_at
            ? formatDuration(Date.now() - new Date(run.started_at).getTime())
            : '—';

          return (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 transition-colors"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {run.proxy_label || run.proxy_id.slice(0, 8)}
                </div>
                {run.provider_name && (
                  <div className="text-xs text-gray-500">{run.provider_name}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{duration}</span>
                <RunStatusBadge status={run.status} />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
