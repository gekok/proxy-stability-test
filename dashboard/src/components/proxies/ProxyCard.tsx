'use client';

import { Proxy } from '@/types';
import { Badge } from '@/components/ui/Badge';

interface ProxyCardProps {
  proxy: Proxy;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function ProxyCard({ proxy, selected, onToggle }: ProxyCardProps) {
  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(proxy.id)}
        className="rounded border-gray-300 text-blue-600"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{proxy.label}</div>
        <div className="text-xs text-gray-500 font-mono">{proxy.host}:{proxy.port}</div>
      </div>
      <Badge variant="neutral">{proxy.protocol}</Badge>
    </label>
  );
}
