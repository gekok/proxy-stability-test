'use client';

import { Provider, Proxy } from '@/types';
import { Button } from '@/components/ui/Button';
import { ProxyList } from '@/components/proxies/ProxyList';

interface ProviderListProps {
  providers: Provider[];
  proxies: Proxy[];
  expandedProviderId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onAddProxy: (providerId: string) => void;
  onEditProxy: (proxy: Proxy) => void;
  onDeleteProxy: (proxy: Proxy) => void;
}

export function ProviderList({
  providers,
  proxies,
  expandedProviderId,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddProxy,
  onEditProxy,
  onDeleteProxy,
}: ProviderListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8" />
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Website</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Proxies</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">Created</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {providers.map((provider) => {
            const providerProxies = proxies.filter(p => p.provider_id === provider.id);
            const isExpanded = expandedProviderId === provider.id;
            return (
              <ProviderRow
                key={provider.id}
                provider={provider}
                proxyCount={providerProxies.length}
                providerProxies={providerProxies}
                isExpanded={isExpanded}
                onToggleExpand={onToggleExpand}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddProxy={onAddProxy}
                onEditProxy={onEditProxy}
                onDeleteProxy={onDeleteProxy}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProviderRow({
  provider,
  proxyCount,
  providerProxies,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddProxy,
  onEditProxy,
  onDeleteProxy,
}: {
  provider: Provider;
  proxyCount: number;
  providerProxies: Proxy[];
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (provider: Provider) => void;
  onAddProxy: (providerId: string) => void;
  onEditProxy: (proxy: Proxy) => void;
  onDeleteProxy: (proxy: Proxy) => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <button
            onClick={() => onToggleExpand(provider.id)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{provider.name}</td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {provider.website ? (
            <a href={provider.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-[180px]">
              {provider.website}
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">{proxyCount}</td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {new Date(provider.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(provider)}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(provider)}>Delete</Button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50">
            <div className="border-l-2 border-blue-300 pl-4">
              <ProxyList
                proxies={providerProxies}
                providerId={provider.id}
                providerName={provider.name}
                onAdd={() => onAddProxy(provider.id)}
                onEdit={onEditProxy}
                onDelete={onDeleteProxy}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
