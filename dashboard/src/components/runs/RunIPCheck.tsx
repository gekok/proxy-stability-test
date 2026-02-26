'use client';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { IPCheckResult } from '@/types';

interface RunIPCheckProps {
  checks: IPCheckResult[];
}

export function RunIPCheck({ checks }: RunIPCheckProps) {
  if (process.env.NODE_ENV === 'development' && checks.length > 0) {
    const c = checks[0];
    console.debug('IP check loaded', {
      module: 'pages.runs',
      run_id: c.run_id,
      is_clean: c.is_clean,
      geo_match: c.geo_match,
    });
  }

  if (checks.length === 0) {
    return (
      <Card title="IP Check">
        <EmptyState title="No IP Check Data" description="IP check has not been performed yet." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {checks.map((check) => (
        <Card key={check.id} title="IP Check Results">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Observed IP</div>
                <div className="text-lg font-mono font-semibold">{check.observed_ip}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Country</div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-mono">
                    {check.actual_country || '—'}
                    {check.expected_country && (
                      <span className="text-sm text-gray-400 ml-1">(expected: {check.expected_country})</span>
                    )}
                  </span>
                  {check.geo_match != null && (
                    <Badge variant={check.geo_match ? 'success' : 'error'}>
                      {check.geo_match ? 'Match' : 'Mismatch'}
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Region</div>
                <div className="font-mono">{check.actual_region || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">City</div>
                <div className="font-mono">{check.actual_city || '—'}</div>
              </div>
            </div>

            <div className="border-t pt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Blacklist</div>
                <div className="flex items-center gap-2">
                  {check.is_clean != null ? (
                    <Badge variant={check.is_clean ? 'success' : 'error'}>
                      {check.is_clean ? 'Clean' : 'Listed'}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  <span className="text-sm text-gray-500">
                    ({check.blacklists_listed}/{check.blacklists_queried} listed)
                  </span>
                </div>
                {check.blacklist_sources && check.blacklist_sources.length > 0 && (
                  <div className="mt-1 text-xs text-red-600">
                    Sources: {(typeof check.blacklist_sources === 'string'
                      ? JSON.parse(check.blacklist_sources as unknown as string)
                      : check.blacklist_sources
                    ).join(', ')}
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-500">IP Stable</div>
                <div className="flex items-center gap-2">
                  {check.ip_stable != null ? (
                    <Badge variant={check.ip_stable ? 'success' : 'warning'}>
                      {check.ip_stable ? 'Stable' : 'Changed'}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                  <span className="text-sm text-gray-500">({check.ip_changes} changes)</span>
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Checked At</div>
                <div className="text-sm font-mono">
                  {check.checked_at ? new Date(check.checked_at).toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
