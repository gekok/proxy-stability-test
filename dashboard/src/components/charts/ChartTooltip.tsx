'use client';

import { formatMs } from './chart-utils';

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  formatter?: (value: number, name: string) => string;
}

export function ChartTooltip({ active, payload, label, formatter }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const format = formatter || ((v: number, name: string) => {
    if (name.toLowerCase().includes('ratio') || name.toLowerCase().includes('rate')) {
      return `${(v * 100).toFixed(1)}%`;
    }
    return formatMs(v);
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      {label && <p className="text-gray-500 mb-1 text-xs">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-700">{entry.name}:</span>
          <span className="font-mono font-medium">{format(entry.value, entry.name)}</span>
        </div>
      ))}
    </div>
  );
}
