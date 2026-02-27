'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Provider, Proxy, ProxyCreate, ProxyUpdate } from '@/types';

interface ProxyFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProxyCreate | ProxyUpdate) => Promise<void>;
  proxy?: Proxy;
  providers: Provider[];
  defaultProviderId?: string;
}

export function ProxyForm({ isOpen, onClose, onSubmit, proxy, providers, defaultProviderId }: ProxyFormProps) {
  const [providerId, setProviderId] = useState('');
  const [label, setLabel] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState('http');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [expectedCountry, setExpectedCountry] = useState('');
  const [isDedicated, setIsDedicated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!proxy;

  useEffect(() => {
    if (isOpen) {
      setProviderId(proxy?.provider_id || defaultProviderId || providers[0]?.id || '');
      setLabel(proxy?.label || '');
      setHost(proxy?.host || '');
      setPort(proxy?.port?.toString() || '');
      setProtocol(proxy?.protocol || 'http');
      setAuthUser(proxy?.auth_user || '');
      setAuthPass('');
      setExpectedCountry(proxy?.expected_country || '');
      setIsDedicated(proxy?.is_dedicated || false);
      setErrors({});
    }
  }, [isOpen, proxy, defaultProviderId, providers]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isEdit && !providerId) newErrors.provider_id = 'Provider is required';
    if (!label.trim()) newErrors.label = 'Label is required';
    if (!host.trim()) newErrors.host = 'Host is required';
    const portNum = parseInt(port, 10);
    if (!port || isNaN(portNum) || portNum < 1 || portNum > 65535) newErrors.port = 'Port must be 1-65535';
    if (!['http', 'https', 'socks5'].includes(protocol)) newErrors.protocol = 'Invalid protocol';

    if (Object.keys(newErrors).length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Form validation failed', {
          form_name: 'proxy',
          fields_with_errors: Object.keys(newErrors),
        });
      }
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEdit) {
        const data: ProxyUpdate = {
          label: label.trim(),
          host: host.trim(),
          port: parseInt(port, 10),
          protocol: protocol as 'http' | 'https' | 'socks5',
          auth_user: authUser.trim() || undefined,
          expected_country: expectedCountry.trim() || undefined,
          is_dedicated: isDedicated,
        };
        if (authPass) data.auth_pass = authPass;
        await onSubmit(data);
      } else {
        const data: ProxyCreate = {
          provider_id: providerId,
          label: label.trim(),
          host: host.trim(),
          port: parseInt(port, 10),
          protocol: protocol as 'http' | 'https' | 'socks5',
          auth_user: authUser.trim() || undefined,
          auth_pass: authPass || undefined,
          expected_country: expectedCountry.trim() || undefined,
          is_dedicated: isDedicated,
        };
        await onSubmit(data);
      }
    } catch {
      // Error handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Proxy' : 'Add Proxy'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEdit && (
          <Select
            label="Provider"
            required
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            options={providers.map(p => ({ value: p.id, label: p.name }))}
            error={errors.provider_id}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Label"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            error={errors.label}
            placeholder="e.g. US-Residential-1"
          />
          <Select
            label="Protocol"
            required
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            options={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
              { value: 'socks5', label: 'SOCKS5' },
            ]}
            error={errors.protocol}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Host"
            required
            value={host}
            onChange={(e) => setHost(e.target.value)}
            error={errors.host}
            placeholder="proxy.example.com"
          />
          <Input
            label="Port"
            required
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            error={errors.port}
            placeholder="8080"
            min={1}
            max={65535}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Username"
            value={authUser}
            onChange={(e) => setAuthUser(e.target.value)}
            placeholder="Optional"
          />
          <Input
            label="Password"
            type="password"
            value={authPass}
            onChange={(e) => setAuthPass(e.target.value)}
            placeholder={isEdit ? 'Leave blank to keep current' : 'Optional'}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Expected Country"
            value={expectedCountry}
            onChange={(e) => setExpectedCountry(e.target.value)}
            placeholder="e.g. US, VN"
          />
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDedicated}
                onChange={(e) => setIsDedicated(e.target.checked)}
                className="rounded border-gray-300"
              />
              Dedicated proxy
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
