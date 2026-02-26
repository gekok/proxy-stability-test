'use client';

import { RunStatus } from '@/types';

interface RunsFilterProps {
  currentStatus: RunStatus | null;
  onStatusChange: (status: RunStatus | null) => void;
}

const tabs: { label: string; value: RunStatus | null }[] = [
  { label: 'All', value: null },
  { label: 'Running', value: 'running' },
  { label: 'Stopping', value: 'stopping' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
];

export function RunsFilter({ currentStatus, onStatusChange }: RunsFilterProps) {
  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.label}
          onClick={() => onStatusChange(tab.value)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            currentStatus === tab.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
