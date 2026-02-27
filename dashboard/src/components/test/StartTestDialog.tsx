'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ProxySelector } from './ProxySelector';
import { TestConfigForm } from './TestConfigForm';
import { apiClient } from '@/lib/api-client';
import { Provider, Proxy, TestRun, RunConfig, ScoringConfig, DEFAULT_RUN_CONFIG, DEFAULT_SCORING_CONFIG } from '@/types';

interface StartTestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  providers: Provider[];
  proxies: Proxy[];
}

type Step = 'select' | 'configure' | 'starting';

export function StartTestDialog({ isOpen, onClose, providers, proxies }: StartTestDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [config, setConfig] = useState<RunConfig>({ ...DEFAULT_RUN_CONFIG });
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig>({ ...DEFAULT_SCORING_CONFIG });
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (step !== 'starting') {
      setStep('select');
      setSelectedIds([]);
      setConfig({ ...DEFAULT_RUN_CONFIG });
      setScoringConfig({ ...DEFAULT_SCORING_CONFIG });
      setProgress([]);
      setError(null);
      onClose();
    }
  };

  const handleStart = async () => {
    setStep('starting');
    setProgress([]);
    setError(null);

    const isDefault = config.http_rpm === 500 && config.https_rpm === 500
      && config.timeout_ms === 10000 && config.warmup_requests === 5;

    if (!isDefault) {
      console.info('[test] Test config customized', {
        config: { http_rpm: config.http_rpm, https_rpm: config.https_rpm,
                  timeout_ms: config.timeout_ms, warmup: config.warmup_requests },
        is_default: false,
        module: 'pages.test',
      });
    }

    const runIds: string[] = [];

    for (let i = 0; i < selectedIds.length; i++) {
      const proxyId = selectedIds[i];
      try {
        const res = await apiClient.post<TestRun>('/runs', {
          proxy_id: proxyId,
          http_rpm: config.http_rpm,
          https_rpm: config.https_rpm,
          request_timeout_ms: config.timeout_ms,
          warmup_requests: config.warmup_requests,
        });
        runIds.push(res.data.id);
        setProgress(prev => [...prev, `Created run ${i + 1}/${selectedIds.length}`]);
      } catch (err) {
        console.error('[test] Test start fail (create)', {
          proxy_id: proxyId,
          error_detail: err instanceof Error ? err.message : String(err),
          created_so_far: runIds.length,
          module: 'pages.test',
        });
        setError(`Failed to create run for proxy ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return;
      }
    }

    console.info('[test] Test runs created', {
      run_ids: runIds, proxy_count: runIds.length, module: 'pages.test',
    });

    setProgress(prev => [...prev, 'Triggering runner...']);

    try {
      const isDefaultScoring = scoringConfig.latency_threshold_ms === 500
        && scoringConfig.jitter_threshold_ms === 100
        && scoringConfig.ws_hold_target_ms === 60000
        && scoringConfig.ip_check_interval_sec === 60;
      await apiClient.post('/runs/start', {
        run_ids: runIds,
        ...(!isDefaultScoring ? { scoring_config: scoringConfig } : {}),
      });
    } catch (err) {
      console.error('[test] Test start fail (trigger)', {
        run_ids: runIds,
        error_detail: err instanceof Error ? err.message : String(err),
        module: 'pages.test',
      });
      setError(`Failed to trigger runner: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return;
    }

    console.info('[test] Test started', {
      run_ids: runIds, proxy_count: runIds.length, started_by: 'user',
      module: 'pages.test',
    });

    setProgress(prev => [...prev, 'Tests started! Redirecting...']);

    setTimeout(() => {
      handleClose();
      if (runIds.length === 1) {
        router.push(`/runs/${runIds[0]}`);
      } else {
        router.push('/runs?status=running');
      }
    }, 1000);
  };

  const stepTitle = step === 'select' ? 'Select Proxies' :
                    step === 'configure' ? 'Configure Test' : 'Starting Tests';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={stepTitle} size="lg">
      {step === 'select' && (
        <>
          <ProxySelector
            providers={providers}
            proxies={proxies}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button onClick={() => setStep('configure')} disabled={selectedIds.length === 0}>
              Next
            </Button>
          </div>
        </>
      )}

      {step === 'configure' && (
        <>
          <TestConfigForm config={config} onChange={setConfig} scoringConfig={scoringConfig} onScoringChange={setScoringConfig} />
          <div className="flex justify-between mt-6">
            <Button variant="ghost" onClick={() => setStep('select')}>Back</Button>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleStart}>
                Start Test ({selectedIds.length} proxy{selectedIds.length !== 1 ? 's' : ''})
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 'starting' && (
        <div className="space-y-2">
          {progress.map((msg, i) => (
            <div key={i} className="text-sm text-gray-600 flex items-center gap-2">
              <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {msg}
            </div>
          ))}
          {error && (
            <div className="text-sm text-red-600 mt-2">{error}</div>
          )}
          {!error && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
