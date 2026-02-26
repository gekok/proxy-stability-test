import { pool } from '../db/pool';
import { logger } from '../logger';
import { decrypt } from '../routes/proxies';

const RUNNER_URL = process.env.RUNNER_URL || 'http://runner:9090';
const TARGET_HTTP_URL = process.env.TARGET_HTTP_URL || 'http://target:3001';
const TARGET_HTTPS_URL = process.env.TARGET_HTTPS_URL || 'https://target:3443';

export async function triggerRunner(runIds: string[]): Promise<{ triggered: number; failed: number; errors: string[] }> {
  const runs: any[] = [];
  const errors: string[] = [];

  for (const runId of runIds) {
    const runResult = await pool.query('SELECT * FROM test_run WHERE id = $1', [runId]);
    if (runResult.rows.length === 0) {
      errors.push(`Run ${runId} not found`);
      continue;
    }

    const run = runResult.rows[0];
    if (run.status !== 'pending') {
      errors.push(`Run ${runId} is not in pending status (current: ${run.status})`);
      continue;
    }

    // Get proxy info with decrypted password
    const proxyResult = await pool.query('SELECT * FROM proxy_endpoint WHERE id = $1', [run.proxy_id]);
    if (proxyResult.rows.length === 0) {
      errors.push(`Proxy for run ${runId} not found`);
      continue;
    }

    const proxy = proxyResult.rows[0];
    let authPass = '';
    if (proxy.auth_pass_enc) {
      try {
        authPass = decrypt(proxy.auth_pass_enc);
      } catch (err: any) {
        logger.error({ module: 'services.runService', run_id: runId, error_detail: err.message }, 'Password decrypt fail');
        errors.push(`Failed to decrypt password for run ${runId}`);
        continue;
      }
    }

    // Update status to running
    await pool.query(
      `UPDATE test_run SET status = 'running', started_at = now() WHERE id = $1`,
      [runId],
    );

    const oldStatus = run.status;
    logger.info({ module: 'services.runService', run_id: runId, old_status: oldStatus, new_status: 'running' }, 'Run status changed');

    runs.push({
      run_id: runId,
      proxy: {
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol,
        auth_user: proxy.auth_user || '',
        auth_pass: authPass,
        expected_country: proxy.expected_country || '',
        label: proxy.label,
      },
      config: {
        http_rpm: run.http_rpm,
        https_rpm: run.https_rpm,
        ws_messages_per_minute: run.ws_messages_per_minute,
        request_timeout_ms: run.request_timeout_ms,
        warmup_requests: run.warmup_requests,
        summary_interval_sec: run.summary_interval_sec,
      },
      target: {
        http_url: TARGET_HTTP_URL,
        https_url: TARGET_HTTPS_URL,
      },
    });
  }

  if (runs.length === 0) {
    return { triggered: 0, failed: errors.length, errors };
  }

  // Trigger runner
  const runnerUrl = `${RUNNER_URL}/trigger`;
  logger.info({
    module: 'services.runService',
    proxy_count: runs.length,
    runner_url: runnerUrl,
    run_ids: runs.map((r) => r.run_id),
  }, 'Run triggered → Runner');

  try {
    const response = await fetch(runnerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runs }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({
        module: 'services.runService',
        runner_url: runnerUrl,
        error_detail: `Runner responded ${response.status}: ${body}`,
        run_ids: runs.map((r) => r.run_id),
      }, 'Runner trigger fail');

      // Revert status to failed
      for (const run of runs) {
        await pool.query(
          `UPDATE test_run SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`,
          [run.run_id, `Runner responded ${response.status}`],
        );
      }

      return { triggered: 0, failed: runs.length + errors.length, errors: [...errors, `Runner responded ${response.status}`] };
    }

    return { triggered: runs.length, failed: errors.length, errors };
  } catch (err: any) {
    logger.error({
      module: 'services.runService',
      runner_url: runnerUrl,
      error_detail: err.message,
      run_ids: runs.map((r) => r.run_id),
    }, 'Runner trigger fail');

    // Revert status to failed
    for (const run of runs) {
      await pool.query(
        `UPDATE test_run SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`,
        [run.run_id, err.message],
      );
    }

    return { triggered: 0, failed: runs.length + errors.length, errors: [...errors, err.message] };
  }
}

export async function stopRun(runId: string): Promise<void> {
  const runResult = await pool.query('SELECT * FROM test_run WHERE id = $1', [runId]);
  if (runResult.rows.length === 0) {
    throw Object.assign(new Error('Run not found'), { statusCode: 404 });
  }

  const run = runResult.rows[0];
  if (run.status !== 'running') {
    throw Object.assign(new Error(`Cannot stop run with status ${run.status}`), { statusCode: 400 });
  }

  const proxyResult = await pool.query('SELECT label FROM proxy_endpoint WHERE id = $1', [run.proxy_id]);
  const proxyLabel = proxyResult.rows[0]?.label || 'unknown';

  await pool.query(
    `UPDATE test_run SET status = 'stopping', stopped_at = now() WHERE id = $1`,
    [runId],
  );

  logger.info({ module: 'services.runService', run_id: runId, old_status: 'running', new_status: 'stopping' }, 'Run status changed');
  logger.info({ module: 'services.runService', run_id: runId, proxy_label: proxyLabel, requested_by: 'user' }, 'Stop requested');

  // Forward stop to runner
  const runnerUrl = `${RUNNER_URL}/stop`;
  try {
    await fetch(runnerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId }),
    });
    logger.info({ module: 'services.runService', run_id: runId, runner_url: runnerUrl }, 'Stop forwarded → Runner');
  } catch (err: any) {
    logger.error({ module: 'services.runService', run_id: runId, runner_url: runnerUrl, error_detail: err.message }, 'Stop forward fail');
  }
}
