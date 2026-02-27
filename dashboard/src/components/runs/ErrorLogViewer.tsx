'use client';

import { useState } from 'react';
import { ErrorLogEntry } from '@/types';
import { Card } from '@/components/ui/Card';

interface ErrorLogViewerProps {
  entries: ErrorLogEntry[];
  loading: boolean;
}

const SOURCE_BADGES = {
  http: 'bg-blue-100 text-blue-700',
  ws: 'bg-purple-100 text-purple-700',
  ip: 'bg-amber-100 text-amber-700',
} as const;

function formatTiming(ms: number | undefined | null): string {
  if (ms == null) return '—';
  return `${Math.round(ms)} ms`;
}

export function ErrorLogViewer({ entries, loading }: ErrorLogViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <Card title="Error Log">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
        </div>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card title="Error Log">
        <p className="text-sm text-gray-500">No errors found for the current filters.</p>
      </Card>
    );
  }

  return (
    <Card title={`Error Log (${entries.length})`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Source</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Protocol</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-36">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <tr key={entry.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                  <td className="px-3 py-2" colSpan={isExpanded ? 4 : undefined}>
                    {!isExpanded ? null : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${SOURCE_BADGES[entry.source]}`}>
                            {entry.source.toUpperCase()}
                          </span>
                          <span className="font-mono text-xs">{entry.error_type}</span>
                          {entry.protocol && <span className="text-xs text-gray-500">{entry.protocol}</span>}
                          <span className="text-xs text-gray-400 ml-auto">{new Date(entry.measured_at).toLocaleString()}</span>
                        </div>
                        {entry.error_message && (
                          <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{entry.error_message}</p>
                        )}
                        {entry.target_url && (
                          <p className="text-xs text-gray-500">URL: <span className="font-mono">{entry.target_url}</span></p>
                        )}
                        {entry.method && (
                          <p className="text-xs text-gray-500">Method: {entry.method} {entry.status_code ? `(${entry.status_code})` : ''}</p>
                        )}
                        {entry.seq != null && (
                          <p className="text-xs text-gray-500">Seq: {entry.seq}</p>
                        )}
                        {entry.timing && (
                          <div className="text-xs text-gray-500 flex gap-4">
                            {entry.timing.tcp_connect_ms != null && <span>TCP: {formatTiming(entry.timing.tcp_connect_ms)}</span>}
                            {entry.timing.tls_handshake_ms != null && <span>TLS: {formatTiming(entry.timing.tls_handshake_ms)}</span>}
                            {entry.timing.ttfb_ms != null && <span>TTFB: {formatTiming(entry.timing.ttfb_ms)}</span>}
                            {entry.timing.total_ms != null && <span>Total: {formatTiming(entry.timing.total_ms)}</span>}
                            {entry.timing.handshake_ms != null && <span>WS Handshake: {formatTiming(entry.timing.handshake_ms)}</span>}
                            {entry.timing.message_rtt_ms != null && <span>RTT: {formatTiming(entry.timing.message_rtt_ms)}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {isExpanded ? null : (
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${SOURCE_BADGES[entry.source]}`}>
                        {entry.source.toUpperCase()}
                      </span>
                    )}
                  </td>
                  {!isExpanded && (
                    <>
                      <td className="px-3 py-2 font-mono text-xs">{entry.error_type}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{entry.protocol || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{new Date(entry.measured_at).toLocaleString()}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
