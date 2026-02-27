'use client';

import { useState } from 'react';
import { useExport } from '@/hooks/useExport';
import { Button } from '@/components/ui/Button';

interface ExportButtonProps {
  runId: string;
  disabled?: boolean;
}

export function ExportButton({ runId, disabled }: ExportButtonProps) {
  const { downloadExport, downloading } = useExport();
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: 'json' | 'csv') => {
    setShowMenu(false);
    setError(null);
    try {
      await downloadExport(runId, format);
    } catch {
      setError('Export failed');
    }
  };

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || downloading}
        onClick={() => setShowMenu(!showMenu)}
      >
        {downloading ? 'Exporting...' : 'Export'}
      </Button>

      {showMenu && (
        <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-10">
          <button
            className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => handleExport('json')}
          >
            JSON
          </button>
          <button
            className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => handleExport('csv')}
          >
            CSV
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
