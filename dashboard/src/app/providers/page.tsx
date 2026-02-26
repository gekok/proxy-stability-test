'use client';

import { useEffect, useState } from 'react';
import { useProviders } from '@/hooks/useProviders';
import { useProxies } from '@/hooks/useProxies';
import { ProviderList } from '@/components/providers/ProviderList';
import { ProviderForm } from '@/components/providers/ProviderForm';
import { DeleteProviderDialog } from '@/components/providers/DeleteProviderDialog';
import { ProxyForm } from '@/components/proxies/ProxyForm';
import { DeleteProxyDialog } from '@/components/proxies/DeleteProxyDialog';
import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Provider, Proxy, ProviderCreate, ProviderUpdate, ProxyCreate, ProxyUpdate } from '@/types';

export default function ProvidersPage() {
  const { providers, loading, error, fetchProviders, createProvider, updateProvider, deleteProvider } = useProviders();
  const { proxies, fetchProxies, createProxy, updateProxy, deleteProxy } = useProxies();
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);
  const [expandedProviderId, setExpandedProviderId] = useState<string | null>(null);
  const [showProxyForm, setShowProxyForm] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [deletingProxy, setDeletingProxy] = useState<Proxy | null>(null);
  const [proxyFormProviderId, setProxyFormProviderId] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
    fetchProxies();
  }, [fetchProviders, fetchProxies]);

  const handleProviderSubmit = async (data: ProviderCreate | ProviderUpdate) => {
    if (editingProvider) {
      await updateProvider(editingProvider.id, data as ProviderUpdate);
    } else {
      await createProvider(data as ProviderCreate);
    }
    setShowProviderForm(false);
    setEditingProvider(null);
  };

  const handleProviderDelete = async () => {
    if (!deletingProvider) return;
    await deleteProvider(deletingProvider.id, deletingProvider.name);
    setDeletingProvider(null);
  };

  const handleAddProxy = (providerId: string) => {
    setProxyFormProviderId(providerId);
    setEditingProxy(null);
    setShowProxyForm(true);
  };

  const handleEditProxy = (proxy: Proxy) => {
    setEditingProxy(proxy);
    setProxyFormProviderId(proxy.provider_id);
    setShowProxyForm(true);
  };

  const handleProxySubmit = async (data: ProxyCreate | ProxyUpdate) => {
    if (editingProxy) {
      await updateProxy(editingProxy.id, editingProxy.label, data as ProxyUpdate);
    } else {
      await createProxy(data as ProxyCreate);
    }
    setShowProxyForm(false);
    setEditingProxy(null);
  };

  const handleProxyDelete = async () => {
    if (!deletingProxy) return;
    const provider = providers.find(p => p.id === deletingProxy.provider_id);
    await deleteProxy(deletingProxy.id, deletingProxy.label, provider?.name || '');
    setDeletingProxy(null);
  };

  if (loading) return <LoadingSpinner size="lg" />;

  if (error) {
    console.error('[providers] Page error', { page_path: '/providers', error_detail: error, module: 'pages.providers' });
    return <ErrorAlert message={error} onRetry={fetchProviders} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Providers</h1>
        <Button onClick={() => { setEditingProvider(null); setShowProviderForm(true); }}>
          Add Provider
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          title="No providers yet"
          description="Add a proxy provider to get started."
          action={{ label: 'Add Provider', onClick: () => setShowProviderForm(true) }}
        />
      ) : (
        <ProviderList
          providers={providers}
          proxies={proxies}
          expandedProviderId={expandedProviderId}
          onToggleExpand={(id) => setExpandedProviderId(expandedProviderId === id ? null : id)}
          onEdit={(provider) => { setEditingProvider(provider); setShowProviderForm(true); }}
          onDelete={(provider) => setDeletingProvider(provider)}
          onAddProxy={handleAddProxy}
          onEditProxy={handleEditProxy}
          onDeleteProxy={(proxy) => setDeletingProxy(proxy)}
        />
      )}

      <ProviderForm
        isOpen={showProviderForm}
        onClose={() => { setShowProviderForm(false); setEditingProvider(null); }}
        onSubmit={handleProviderSubmit}
        provider={editingProvider || undefined}
      />

      {deletingProvider && (
        <DeleteProviderDialog
          isOpen={!!deletingProvider}
          provider={deletingProvider}
          proxyCount={proxies.filter(p => p.provider_id === deletingProvider.id).length}
          onConfirm={handleProviderDelete}
          onCancel={() => setDeletingProvider(null)}
        />
      )}

      <ProxyForm
        isOpen={showProxyForm}
        onClose={() => { setShowProxyForm(false); setEditingProxy(null); }}
        onSubmit={handleProxySubmit}
        proxy={editingProxy || undefined}
        providers={providers}
        defaultProviderId={proxyFormProviderId || undefined}
      />

      {deletingProxy && (
        <DeleteProxyDialog
          isOpen={!!deletingProxy}
          proxy={deletingProxy}
          onConfirm={handleProxyDelete}
          onCancel={() => setDeletingProxy(null)}
        />
      )}
    </div>
  );
}
