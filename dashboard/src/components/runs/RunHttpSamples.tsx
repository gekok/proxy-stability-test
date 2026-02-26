'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HttpSample } from '@/types';

interface RunHttpSamplesProps {
  samples: HttpSample[];
}

type SampleFilter = 'all' | 'http' | 'https' | 'errors';

export function RunHttpSamples({ samples }: RunHttpSamplesProps) {
  const [filter, setFilter] = useState<SampleFilter>('all');

  const filteredSamples = samples.filter(s => {
    if (filter === 'http') return !s.is_https;
    if (filter === 'https') return s.is_https;
    if (filter === 'errors') return s.error_type || (s.status_code && s.status_code >= 400);
    return true;
  });

  const filters: { label: string; value: SampleFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'HTTP', value: 'http' },
    { label: 'HTTPS', value: 'https' },
    { label: 'Errors', value: 'errors' },
  ];

  return (
    <Card title="Recent Samples">
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === f.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredSamples.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No samples to display.</p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-12">#</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-16">Method</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-16">Proto</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-16">Status</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-20">TTFB</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-20">Total</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-20">TLS</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500">Error</th>
                <th className="px-2 py-1 text-left text-xs text-gray-500 w-36">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSamples.map((s) => (
                <tr key={s.id} className={s.error_type ? 'bg-red-50' : ''}>
                  <td className="px-2 py-1 font-mono text-gray-500">{s.seq}</td>
                  <td className="px-2 py-1">
                    <Badge variant="neutral">{s.method}</Badge>
                  </td>
                  <td className="px-2 py-1 text-gray-600">{s.is_https ? 'HTTPS' : 'HTTP'}</td>
                  <td className="px-2 py-1">
                    {s.status_code ? (
                      <span className={s.status_code < 400 ? 'text-green-600' : 'text-red-600'}>
                        {s.status_code}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono">{s.ttfb_ms != null ? `${Math.round(s.ttfb_ms)}` : '—'}</td>
                  <td className="px-2 py-1 font-mono">{s.total_ms != null ? `${Math.round(s.total_ms)}` : '—'}</td>
                  <td className="px-2 py-1 font-mono">
                    {s.is_https && s.tls_handshake_ms != null ? `${Math.round(s.tls_handshake_ms)}` : '—'}
                  </td>
                  <td className="px-2 py-1 text-red-600 text-xs truncate max-w-[150px]">
                    {s.error_type || ''}
                  </td>
                  <td className="px-2 py-1 text-gray-500 text-xs">
                    {new Date(s.measured_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
