'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Proxy } from '@/types';

interface DeleteProxyDialogProps {
  isOpen: boolean;
  proxy: Proxy;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteProxyDialog({ isOpen, proxy, onConfirm, onCancel }: DeleteProxyDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onConfirm={handleConfirm}
      onCancel={onCancel}
      title="Delete Proxy"
      message={`Delete proxy "${proxy.label}" (${proxy.host}:${proxy.port})? All associated test runs will also be deleted.`}
      confirmLabel="Delete"
      variant="danger"
      loading={loading}
    />
  );
}
