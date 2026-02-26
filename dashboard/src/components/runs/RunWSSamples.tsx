'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { WsSample } from '@/types';

interface RunWSSamplesProps {
  samples: WsSample[];
}

function formatMs(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${Math.round(val)} ms`;
}

function getProtocol(url: string): string {
  return url.startsWith('wss://') ? 'wss' : 'ws';
}

function getDisconnectVariant(reason: string | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (!reason) return 'neutral';
  switch (reason) {
    case 'hold_complete':
    case 'messages_complete':
    case 'client_close':
      return 'success';
    case 'context_cancelled':
      return 'warning';
    case 'pong_timeout':
    case 'read_error':
    case 'write_error':
    case 'dial_failed':
      return 'error';
    default:
      return 'neutral';
  }
}

export function RunWSSamples({ samples }: RunWSSamplesProps) {
  if (process.env.NODE_ENV === 'development' && samples.length > 0) {
    console.debug('WS samples tab loaded', {
      module: 'pages.runs',
      ws_sample_count: samples.length,
    });
  }

  if (samples.length === 0) {
    return (
      <Card title="WS Connections">
        <EmptyState title="No WebSocket Data" description="No WebSocket connections recorded yet." />
      </Card>
    );
  }

  return (
    <Card title="WS Connections">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Protocol</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Handshake</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">RTT avg</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Messages</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Drops</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Held</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Disconnect</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {samples.map((s) => {
              const protocol = getProtocol(s.target_url);
              return (
                <tr key={s.id}>
                  <td className="px-3 py-2 text-sm font-mono text-gray-600">{s.seq}</td>
                  <td className="px-3 py-2 text-sm">
                    <Badge variant={protocol === 'wss' ? 'success' : 'info'}>
                      {protocol.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {s.connected ? (
                      <Badge variant="success">OK</Badge>
                    ) : (
                      <Badge variant="error">Fail</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono">{formatMs(s.handshake_ms)}</td>
                  <td className="px-3 py-2 text-sm font-mono">{formatMs(s.message_rtt_ms)}</td>
                  <td className="px-3 py-2 text-sm font-mono">{s.messages_sent} / {s.messages_received}</td>
                  <td className="px-3 py-2 text-sm font-mono">
                    {s.drop_count > 0 ? (
                      <span className="text-red-600 font-semibold">{s.drop_count}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono">
                    {s.connection_held_ms != null
                      ? `${(s.connection_held_ms / 1000).toFixed(1)}s`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {s.disconnect_reason ? (
                      <Badge variant={getDisconnectVariant(s.disconnect_reason)}>
                        {s.disconnect_reason}
                      </Badge>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
