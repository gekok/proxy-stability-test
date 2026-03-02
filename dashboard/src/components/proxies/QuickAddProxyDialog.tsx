'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Provider, Proxy, ProxyCreate } from '@/types';

interface ParsedProxy {
  host: string;
  port: number;
  username: string;
  password: string;
  label: string;
  raw: string;
  error?: string;
}

interface QuickAddProxyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProxyCreate) => Promise<void>;
  providers: Provider[];
  existingProxies: Proxy[];
}

function parseProxyLine(line: string): ParsedProxy {
  const trimmed = line.trim();
  if (!trimmed) return { host: '', port: 0, username: '', password: '', label: '', raw: trimmed, error: 'Empty line' };

  const parts = trimmed.split(':');
  if (parts.length < 2) {
    return { host: '', port: 0, username: '', password: '', label: '', raw: trimmed, error: 'Invalid format. Expected host:port or host:port:user:pass' };
  }

  const host = parts[0];
  const port = parseInt(parts[1], 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return { host, port: 0, username: '', password: '', label: '', raw: trimmed, error: `Invalid port: ${parts[1]}` };
  }

  const username = parts[2] || '';
  const password = parts.slice(3).join(':') || '';

  // Auto-generate label from host subdomain
  const hostParts = host.split('.');
  const label = hostParts.length > 2 ? hostParts[0] : host;

  return { host, port, username, password, label, raw: trimmed };
}

export function QuickAddProxyDialog({ isOpen, onClose, onSubmit, providers, existingProxies }: QuickAddProxyDialogProps) {
  const [proxyText, setProxyText] = useState('');
  const [providerId, setProviderId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{ line: string; ok: boolean; error?: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setProxyText('');
      setProviderId(providers[0]?.id || '');
      setResults([]);
      setError('');
    }
  }, [isOpen, providers]);

  // Build a set of existing host:port for duplicate detection
  const existingSet = new Set(existingProxies.map((p) => `${p.host}:${p.port}`));

  const parsed = proxyText
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const p = parseProxyLine(line);
      if (p.error) return p;
      const key = `${p.host}:${p.port}`;
      if (existingSet.has(key)) {
        return { ...p, error: `Duplicate — ${key} already exists` };
      }
      return p;
    });

  // Also detect duplicates within the input itself
  const seenInInput = new Set<string>();
  for (const p of parsed) {
    if (p.error) continue;
    const key = `${p.host}:${p.port}`;
    if (seenInInput.has(key)) {
      p.error = `Duplicate — ${key} entered twice`;
    } else {
      seenInInput.add(key);
    }
  }

  const validCount = parsed.filter((p) => !p.error).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId) {
      setError('Please select a provider');
      return;
    }
    if (validCount === 0) {
      setError('No valid proxy lines');
      return;
    }

    setSubmitting(true);
    setError('');
    const newResults: { line: string; ok: boolean; error?: string }[] = [];

    for (const p of parsed) {
      if (p.error) {
        newResults.push({ line: p.raw, ok: false, error: p.error });
        continue;
      }
      try {
        const data: ProxyCreate = {
          provider_id: providerId,
          label: p.label,
          host: p.host,
          port: p.port,
          protocol: 'http',
          auth_user: p.username || undefined,
          auth_pass: p.password || undefined,
        };
        await onSubmit(data);
        newResults.push({ line: p.raw, ok: true });
      } catch (err) {
        newResults.push({ line: p.raw, ok: false, error: err instanceof Error ? err.message : 'Failed' });
      }
    }

    setResults(newResults);
    setSubmitting(false);

    const allOk = newResults.every((r) => r.ok);
    if (allOk) {
      onClose();
    }
  };

  const showResults = results.length > 0;
  const hasErrors = results.some((r) => !r.ok);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Add Proxies" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Provider"
          required
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
          options={providers.map((p) => ({ value: p.id, label: p.name }))}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Proxy Lines <span className="text-red-500 ml-1">*</span>
          </label>
          <textarea
            value={proxyText}
            onChange={(e) => { setProxyText(e.target.value); setResults([]); }}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2 font-mono"
            rows={5}
            placeholder={"host:port:user:pass\nhost2:port2:user2:pass2"}
          />
          <p className="mt-1 text-xs text-gray-500">
            One proxy per line. Format: <code className="bg-gray-100 px-1 rounded">host:port:user:pass</code> or <code className="bg-gray-100 px-1 rounded">host:port</code>
          </p>
        </div>

        {/* Preview parsed proxies */}
        {parsed.length > 0 && !showResults && (
          <div className="text-sm space-y-1">
            <p className="font-medium text-gray-700">Preview ({validCount} valid):</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {parsed.map((p, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded ${p.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  {p.error ? (
                    <span>{p.raw} — {p.error}</span>
                  ) : (
                    <span>{p.label} | {p.host}:{p.port} | {p.username ? `${p.username}:***` : 'no auth'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results after submit */}
        {showResults && (
          <div className="text-sm space-y-1">
            <p className="font-medium text-gray-700">Results:</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {results.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded ${r.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  <span>{r.ok ? 'OK' : 'FAIL'}</span>
                  <span>{r.line}</span>
                  {r.error && <span>— {r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            {showResults && !hasErrors ? 'Done' : 'Cancel'}
          </Button>
          {(!showResults || hasErrors) && (
            <Button type="submit" loading={submitting} disabled={validCount === 0}>
              Add {validCount > 0 ? `${validCount} Proxy${validCount > 1 ? 'es' : ''}` : 'Proxies'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
