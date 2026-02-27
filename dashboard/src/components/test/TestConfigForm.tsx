'use client';

import { useState } from 'react';
import { RunConfig, ScoringConfig, DEFAULT_SCORING_CONFIG } from '@/types';
import { Input } from '@/components/ui/Input';

interface TestConfigFormProps {
  config: RunConfig;
  onChange: (config: RunConfig) => void;
  scoringConfig?: ScoringConfig;
  onScoringChange?: (config: ScoringConfig) => void;
}

const runFields = [
  { key: 'http_rpm' as const, label: 'HTTP requests/min', min: 10, max: 2000 },
  { key: 'https_rpm' as const, label: 'HTTPS requests/min', min: 10, max: 2000 },
  { key: 'timeout_ms' as const, label: 'Request timeout (ms)', min: 1000, max: 60000 },
  { key: 'warmup_requests' as const, label: 'Warmup requests', min: 0, max: 50 },
];

const scoringFields = [
  { key: 'latency_threshold_ms' as const, label: 'Latency threshold (ms)', min: 100, max: 5000 },
  { key: 'jitter_threshold_ms' as const, label: 'Jitter threshold (ms)', min: 10, max: 1000 },
  { key: 'ws_hold_target_ms' as const, label: 'WS hold target (ms)', min: 5000, max: 300000 },
  { key: 'ip_check_interval_sec' as const, label: 'IP check interval (sec)', min: 10, max: 600 },
];

export function TestConfigForm({ config, onChange, scoringConfig, onScoringChange }: TestConfigFormProps) {
  const [showScoring, setShowScoring] = useState(false);
  const sc = scoringConfig || DEFAULT_SCORING_CONFIG;

  const handleChange = (key: keyof RunConfig, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      onChange({ ...config, [key]: num });
    }
  };

  const handleScoringChange = (key: keyof ScoringConfig, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && onScoringChange) {
      onScoringChange({ ...sc, [key]: num });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Leave defaults unless you know what you&apos;re doing.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {runFields.map(({ key, label, min, max }) => (
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

      <div>
        <button
          type="button"
          className="text-sm text-blue-600 hover:underline"
          onClick={() => setShowScoring(!showScoring)}
        >
          {showScoring ? 'Hide' : 'Show'} Scoring Thresholds
        </button>
      </div>

      {showScoring && onScoringChange && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-500 mb-3">Scoring thresholds (advanced)</p>
          <div className="grid grid-cols-2 gap-4">
            {scoringFields.map(({ key, label, min, max }) => (
              <Input
                key={key}
                label={label}
                type="number"
                min={min}
                max={max}
                value={sc[key].toString()}
                onChange={(e) => handleScoringChange(key, e.target.value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
