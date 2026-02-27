'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRunDetail } from '@/hooks/useRunDetail';
import { usePolling } from '@/hooks/usePolling';
import { RunHeader } from '@/components/runs/RunHeader';
import { RunSummaryCards } from '@/components/runs/RunSummaryCards';
import { RunMetricsDetail } from '@/components/runs/RunMetricsDetail';
import { RunHttpSamples } from '@/components/runs/RunHttpSamples';
import { RunWSSamples } from '@/components/runs/RunWSSamples';
import { RunIPCheck } from '@/components/runs/RunIPCheck';
import { RunScoreBreakdown } from '@/components/runs/RunScoreBreakdown';
import { ErrorLogViewer } from '@/components/runs/ErrorLogViewer';
import { ErrorLogFilters } from '@/components/runs/ErrorLogFilters';
import { useErrorLogs } from '@/hooks/useErrorLogs';
import { useChartData } from '@/hooks/useChartData';
import { useSummaryHistory } from '@/hooks/useSummaryHistory';
import { ChartErrorBoundary } from '@/components/charts/ChartErrorBoundary';
import { LatencyChart } from '@/components/charts/LatencyChart';
import { UptimeTimeline } from '@/components/charts/UptimeTimeline';
import { ScoreGauge } from '@/components/charts/ScoreGauge';
import { ScoreHistoryChart } from '@/components/charts/ScoreHistoryChart';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const TABS = [
  { id: 'http', label: 'HTTP Samples' },
  { id: 'ws', label: 'WS Connections' },
  { id: 'ip', label: 'IP Check' },
  { id: 'score', label: 'Score Breakdown' },
  { id: 'charts', label: 'Charts' },
  { id: 'errors', label: 'Errors' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [activeTab, setActiveTab] = useState<TabId>('http');
  const { run, summary, samples, wsSamples, ipChecks, loading, error, fetchRunDetail, stopRun, isActive } = useRunDetail(runId, activeTab);
  const { entries: errorEntries, allEntries: allErrors, loading: errorsLoading, filters: errorFilters, updateFilter: updateErrorFilter, errorTypes, fetchErrorLogs } = useErrorLogs(runId);
  const { latencyData, uptimeData, loading: chartsLoading } = useChartData(runId, isActive);
  const scoreHistory = useSummaryHistory(summary);
  const pollingStartedRef = useRef(false);

  // Fetch error logs on mount + when Errors tab is activated
  useEffect(() => { fetchErrorLogs(); }, [fetchErrorLogs]);

  useEffect(() => {
    if (activeTab === 'errors') {
      fetchErrorLogs();
    }
  }, [activeTab, fetchErrorLogs]);

  usePolling(fetchRunDetail, {
    interval: 3000,
    enabled: isActive,
    source: 'RunDetailPage',
    fetchOnMount: true,
  });

  useEffect(() => {
    if (isActive && !pollingStartedRef.current) {
      pollingStartedRef.current = true;
      if (process.env.NODE_ENV === 'development') {
        console.debug('Realtime polling started', { run_id: runId, interval_ms: 3000 });
      }
    }
    if (!isActive && pollingStartedRef.current) {
      pollingStartedRef.current = false;
      const reason = run?.status === 'completed' ? 'completed'
                   : run?.status === 'failed' ? 'failed' : 'unmount';
      if (process.env.NODE_ENV === 'development') {
        console.debug('Realtime polling stopped', { run_id: runId, reason });
      }
    }
  }, [isActive, runId, run?.status]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorAlert message={error} onRetry={fetchRunDetail} />;

  if (!run) {
    console.error('[runs] Page error', {
      page_path: `/runs/${runId}`,
      error_detail: 'Run not found',
      module: 'pages.runs',
    });
    return <ErrorAlert title="Run Not Found" message={`No test run with ID ${runId}`} />;
  }

  return (
    <div className="space-y-6">
      <RunHeader run={run} onStop={stopRun} />
      <RunSummaryCards summary={summary} />
      <RunMetricsDetail summary={summary} run={run} />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.id === 'ws' && wsSamples.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {wsSamples.length}
                </span>
              )}
              {tab.id === 'ip' && ipChecks.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {ipChecks.length}
                </span>
              )}
              {tab.id === 'errors' && allErrors.length > 0 && (
                <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                  {allErrors.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'http' && <RunHttpSamples samples={samples} />}
      {activeTab === 'ws' && <RunWSSamples samples={wsSamples} />}
      {activeTab === 'ip' && <RunIPCheck checks={ipChecks} />}
      {activeTab === 'score' && <RunScoreBreakdown summary={summary} />}
      {activeTab === 'charts' && (
        <div className="space-y-6">
          <div className="flex items-start gap-6">
            <ChartErrorBoundary title="Score Gauge">
              <ScoreGauge score={summary?.score_total} />
            </ChartErrorBoundary>
            <div className="flex-1">
              <ChartErrorBoundary title="Score History">
                <ScoreHistoryChart data={scoreHistory} />
              </ChartErrorBoundary>
            </div>
          </div>
          <ChartErrorBoundary title="Latency Chart">
            <LatencyChart data={latencyData} loading={chartsLoading} />
          </ChartErrorBoundary>
          <ChartErrorBoundary title="Uptime Timeline">
            <UptimeTimeline data={uptimeData} loading={chartsLoading} />
          </ChartErrorBoundary>
        </div>
      )}
      {activeTab === 'errors' && (
        <div>
          <ErrorLogFilters filters={errorFilters} errorTypes={errorTypes} onChange={updateErrorFilter} />
          <ErrorLogViewer entries={errorEntries} loading={errorsLoading} />
        </div>
      )}
    </div>
  );
}
