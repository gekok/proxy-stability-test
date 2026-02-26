'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Provider, ProviderCreate, ProviderUpdate } from '@/types';

interface ProviderFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProviderCreate | ProviderUpdate) => Promise<void>;
  provider?: Provider;
}

export function ProviderForm({ isOpen, onClose, onSubmit, provider }: ProviderFormProps) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!provider;

  useEffect(() => {
    if (isOpen) {
      setName(provider?.name || '');
      setWebsite(provider?.website || '');
      setNotes(provider?.notes || '');
      setErrors({});
    }
  }, [isOpen, provider]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';

    if (Object.keys(newErrors).length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Form validation failed', {
          form_name: 'provider',
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
      await onSubmit({
        name: name.trim(),
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } catch {
      // Error handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Provider' : 'Add Provider'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="e.g. BrightData, Oxylabs"
        />
        <Input
          label="Website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this provider..."
          />
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
