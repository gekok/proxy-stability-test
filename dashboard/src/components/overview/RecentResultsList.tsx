'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { RunStatusBadge } from '@/components/runs/RunStatusBadge';
import { TestRun, formatDuration } from '@/types';

interface RecentResultsListProps {
  runs: TestRun[];
}

export function RecentResultsList({ runs }: RecentResultsListProps) {
  if (runs.length === 0) {
    return (
      <Card title="Recent Results">
        <p className="text-sm text-gray-500 text-center py-4">
          No completed tests yet.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Recent Results">
      <div className="space-y-3">
        {runs.map((run) => {
          const duration = run.started_at && run.finished_at
            ? formatDuration(
                new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
              )
            : '—';
          const totalSamples = run.total_http_samples + run.total_https_samples;

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
                <div className="text-xs text-gray-500">
                  {totalSamples.toLocaleString()} samples &middot; {duration}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RunStatusBadge status={run.status} />
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
