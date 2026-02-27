'use client';

import { ErrorLogFilterState } from '@/types';
import { Select } from '@/components/ui/Select';

interface ErrorLogFiltersProps {
  filters: ErrorLogFilterState;
  errorTypes: string[];
  onChange: (key: keyof ErrorLogFilterState, value: string) => void;
}

export function ErrorLogFilters({ filters, errorTypes, onChange }: ErrorLogFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <Select
        label="Source"
        value={filters.source}
        onChange={(e) => onChange('source', e.target.value)}
        options={[
          { value: 'all', label: 'All Sources' },
          { value: 'http', label: 'HTTP' },
          { value: 'ws', label: 'WebSocket' },
          { value: 'ip', label: 'IP Check' },
        ]}
      />
      <Select
        label="Error Type"
        value={filters.error_type}
        onChange={(e) => onChange('error_type', e.target.value)}
        options={[
          { value: '', label: 'All Types' },
          ...errorTypes.map(t => ({ value: t, label: t })),
        ]}
      />
      <Select
        label="Protocol"
        value={filters.protocol}
        onChange={(e) => onChange('protocol', e.target.value)}
        options={[
          { value: '', label: 'All Protocols' },
          { value: 'http', label: 'HTTP' },
          { value: 'https', label: 'HTTPS' },
          { value: 'ws', label: 'WS' },
          { value: 'wss', label: 'WSS' },
        ]}
      />
    </div>
  );
}
