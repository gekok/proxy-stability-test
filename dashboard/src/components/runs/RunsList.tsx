'use client';

import { useRouter } from 'next/navigation';
import { TestRun, formatDuration } from '@/types';
import { RunStatusBadge } from './RunStatusBadge';

interface RunsListProps {
  runs: TestRun[];
  loading: boolean;
}

export function RunsList({ runs, loading }: RunsListProps) {
  const router = useRouter();

  if (loading && runs.length === 0) {
    return (
      <div className="animate-pulse">
        <div className="h-10 bg-gray-200 rounded mb-2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded mb-1" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proxy</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-36">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Samples</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">Duration</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-36">Created</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {runs.map((run) => {
            const totalSamples = run.total_http_samples + run.total_https_samples;
            const duration = run.started_at
              ? formatDuration(
                  (run.finished_at ? new Date(run.finished_at).getTime() : Date.now()) -
                  new Date(run.started_at).getTime()
                )
              : '—';

            return (
              <tr
                key={run.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => router.push(`/runs/${run.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-blue-600 hover:underline">
                    {run.proxy_label || run.proxy_id.slice(0, 8)}
                  </div>
                  {run.provider_name && (
                    <div className="text-xs text-gray-500">{run.provider_name}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <RunStatusBadge status={run.status} />
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {totalSamples.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{duration}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(run.created_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
