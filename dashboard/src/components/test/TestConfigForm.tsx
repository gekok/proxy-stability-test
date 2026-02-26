'use client';

import { RunConfig } from '@/types';
import { Input } from '@/components/ui/Input';

interface TestConfigFormProps {
  config: RunConfig;
  onChange: (config: RunConfig) => void;
}

const fields = [
  { key: 'http_rpm' as const, label: 'HTTP requests/min', min: 10, max: 2000 },
  { key: 'https_rpm' as const, label: 'HTTPS requests/min', min: 10, max: 2000 },
  { key: 'timeout_ms' as const, label: 'Request timeout (ms)', min: 1000, max: 60000 },
  { key: 'warmup_requests' as const, label: 'Warmup requests', min: 0, max: 50 },
];

export function TestConfigForm({ config, onChange }: TestConfigFormProps) {
  const handleChange = (key: keyof RunConfig, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      onChange({ ...config, [key]: num });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Leave defaults unless you know what you&apos;re doing.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {fields.map(({ key, label, min, max }) => (
          <Input
            key={key}
            label={label}
            type="number"
            min={min}
            max={max}
            value={config[key].toString()}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        ))}
      </div>
    </div>
  );
}
