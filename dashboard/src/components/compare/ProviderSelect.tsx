'use client';

import { Provider } from '@/types';

interface ProviderSelectProps {
  providers: Provider[];
  selected: string[];
  onChange: (ids: string[]) => void;
  maxSelect?: number;
}

export function ProviderSelect({ providers, selected, onChange, maxSelect = 5 }: ProviderSelectProps) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else if (selected.length < maxSelect) {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Select Providers (min 2, max {maxSelect})
      </label>
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => {
          const isSelected = selected.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } ${!isSelected && selected.length >= maxSelect ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!isSelected && selected.length >= maxSelect}
            >
              {p.name}
            </button>
          );
        })}
      </div>
      {providers.length === 0 && (
        <p className="text-sm text-gray-500 mt-1">No providers found. Create providers first.</p>
      )}
    </div>
  );
}
