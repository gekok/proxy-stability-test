'use client';

import { Provider, Proxy } from '@/types';
import { ProxyCard } from '@/components/proxies/ProxyCard';

interface ProxySelectorProps {
  providers: Provider[];
  proxies: Proxy[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function ProxySelector({ providers, proxies, selectedIds, onSelectionChange }: ProxySelectorProps) {
  const activeProxies = proxies.filter(p => p.is_active);

  const toggleProxy = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(sid => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const toggleProvider = (providerId: string) => {
    const providerProxyIds = activeProxies
      .filter(p => p.provider_id === providerId)
      .map(p => p.id);

    const allSelected = providerProxyIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      onSelectionChange(selectedIds.filter(id => !providerProxyIds.includes(id)));
    } else {
      const newIds = new Set([...selectedIds, ...providerProxyIds]);
      onSelectionChange(Array.from(newIds));
    }
  };

  const providersWithProxies = providers
    .map(p => ({
      provider: p,
      proxies: activeProxies.filter(px => px.provider_id === p.id),
    }))
    .filter(g => g.proxies.length > 0);

  if (providersWithProxies.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No active proxies available. Add proxies in the Providers page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {providersWithProxies.map(({ provider, proxies: providerProxies }) => {
        const allSelected = providerProxies.every(p => selectedIds.includes(p.id));
        return (
          <div key={provider.id}>
            <div className="flex items-center gap-2 mb-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => toggleProvider(provider.id)}
                  className="rounded border-gray-300 text-blue-600"
                />
                {provider.name}
              </label>
              <span className="text-xs text-gray-400">({providerProxies.length} proxies)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-6">
              {providerProxies.map(proxy => (
                <ProxyCard
                  key={proxy.id}
                  proxy={proxy}
                  selected={selectedIds.includes(proxy.id)}
                  onToggle={toggleProxy}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="text-sm text-gray-500">
        {selectedIds.length} proxy(s) selected
      </div>
    </div>
  );
}
