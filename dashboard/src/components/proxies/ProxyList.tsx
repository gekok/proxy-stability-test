'use client';

import { Proxy } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface ProxyListProps {
  proxies: Proxy[];
  providerId: string;
  providerName: string;
  onAdd: () => void;
  onEdit: (proxy: Proxy) => void;
  onDelete: (proxy: Proxy) => void;
}

export function ProxyList({
  proxies,
  providerName,
  onAdd,
  onEdit,
  onDelete,
}: ProxyListProps) {
  if (proxies.length === 0) {
    return (
      <EmptyState
        title={`No proxies for ${providerName}`}
        description="Add a proxy endpoint to start testing."
        action={{ label: 'Add Proxy', onClick: onAdd }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Proxies ({proxies.length})
        </h3>
        <Button size="sm" onClick={onAdd}>Add Proxy</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-48">Host:Port</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Protocol</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">Auth</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Country</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Dedicated</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {proxies.map((proxy) => (
              <tr key={proxy.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-sm font-medium text-gray-900">{proxy.label}</td>
                <td className="px-3 py-2 text-sm text-gray-500 font-mono">{proxy.host}:{proxy.port}</td>
                <td className="px-3 py-2">
                  <Badge variant="neutral">{proxy.protocol}</Badge>
                </td>
                <td className="px-3 py-2 text-sm text-gray-500">
                  {proxy.auth_user || proxy.has_password ? 'Yes' : 'No'}
                </td>
                <td className="px-3 py-2 text-sm text-gray-500">{proxy.expected_country || '—'}</td>
                <td className="px-3 py-2 text-sm text-gray-500">{proxy.is_dedicated ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(proxy)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(proxy)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
