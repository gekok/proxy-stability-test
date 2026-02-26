'use client';

import { useEffect, useState } from 'react';
import { useProviders } from '@/hooks/useProviders';
import { useProxies } from '@/hooks/useProxies';
import { useRuns } from '@/hooks/useRuns';
import { usePolling } from '@/hooks/usePolling';
import { StatCards } from '@/components/overview/StatCards';
import { ActiveRunsList } from '@/components/overview/ActiveRunsList';
import { RecentResultsList } from '@/components/overview/RecentResultsList';
import { StartTestDialog } from '@/components/test/StartTestDialog';
import { Button } from '@/components/ui/Button';

export default function OverviewPage() {
  const { providers, fetchProviders } = useProviders();
  const { proxies, fetchProxies } = useProxies();
  const { runs, fetchRuns, hasActiveRuns } = useRuns();
  const [showStartDialog, setShowStartDialog] = useState(false);

  useEffect(() => {
    fetchProviders();
    fetchProxies();
    fetchRuns();
  }, [fetchProviders, fetchProxies, fetchRuns]);

  usePolling(fetchRuns, {
    interval: 5000,
    enabled: hasActiveRuns,
    source: 'OverviewPage',
  });

  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'stopping');
  const recentResults = runs
    .filter(r => r.status === 'completed' || r.status === 'failed')
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <Button onClick={() => setShowStartDialog(true)}>Start Test</Button>
      </div>
      <StatCards
        providersCount={providers.length}
        proxiesCount={proxies.length}
        activeRunsCount={activeRuns.length}
      />
      <ActiveRunsList runs={activeRuns} />
      <RecentResultsList runs={recentResults} />

      <StartTestDialog
        isOpen={showStartDialog}
        onClose={() => setShowStartDialog(false)}
        providers={providers}
        proxies={proxies}
      />
    </div>
  );
}
