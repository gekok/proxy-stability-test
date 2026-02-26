'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Provider } from '@/types';

interface DeleteProviderDialogProps {
  isOpen: boolean;
  provider: Provider;
  proxyCount: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteProviderDialog({
  isOpen,
  provider,
  proxyCount,
  onConfirm,
  onCancel,
}: DeleteProviderDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const message = proxyCount > 0
    ? `Delete provider "${provider.name}"? This will also delete ${proxyCount} proxy(s) and all associated test runs.`
    : `Delete provider "${provider.name}"?`;

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onConfirm={handleConfirm}
      onCancel={onCancel}
      title="Delete Provider"
      message={message}
      confirmLabel="Delete"
      variant="danger"
      loading={loading}
    />
  );
}
