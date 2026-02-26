import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { logger } from '../logger';
import { parsePagination, buildPaginationResponse } from '../middleware/pagination';
import { triggerRunner, stopRun } from '../services/runService';

export const runsRouter = Router();

// POST /api/v1/runs — Create a new run
runsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      proxy_id,
      run_mode = 'continuous',
      http_rpm = 500,
      https_rpm = 500,
      ws_messages_per_minute = 60,
      request_timeout_ms = 10000,
      warmup_requests = 5,
      summary_interval_sec = 30,
    } = req.body;

    if (!proxy_id) {
      logger.warn({ module: 'routes.runs', validation_errors: ['proxy_id is required'] }, 'Validation error');
      return res.status(400).json({ error: { message: 'proxy_id is required' } });
    }

    // Verify proxy exists
    const proxyResult = await pool.query('SELECT id FROM proxy_endpoint WHERE id = $1', [proxy_id]);
    if (proxyResult.rows.length === 0) {
      return res.status(400).json({ error: { message: 'Proxy not found' } });
    }

    const configSnapshot = { http_rpm, https_rpm, ws_messages_per_minute, request_timeout_ms, warmup_requests, summary_interval_sec };

    const result = await pool.query(
      `INSERT INTO test_run (proxy_id, run_mode, http_rpm, https_rpm, ws_messages_per_minute, request_timeout_ms, warmup_requests, summary_interval_sec, config_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [proxy_id, run_mode, http_rpm, https_rpm, ws_messages_per_minute, request_timeout_ms, warmup_requests, summary_interval_sec, JSON.stringify(configSnapshot)],
    );

    const run = result.rows[0];
    logger.info({
      module: 'routes.runs',
      run_id: run.id,
      proxy_id,
      run_mode,
      config_summary: configSnapshot,
    }, 'Run created');

    res.status(201).json({ data: run });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/runs/start — Trigger runner for pending runs
runsRouter.post('/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { run_ids } = req.body;

    if (!run_ids || !Array.isArray(run_ids) || run_ids.length === 0) {
      return res.status(400).json({ error: { message: 'run_ids array is required' } });
    }

    const result = await triggerRunner(run_ids);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/runs/:id/stop — Stop a running test
runsRouter.post('/:id/stop', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await stopRun(req.params.id);
    res.json({ data: { status: 'stopping' } });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/runs
runsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, cursor } = parsePagination(req);
    const proxyId = req.query.proxy_id as string;
    const status = req.query.status as string;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (proxyId) { conditions.push(`t.proxy_id = $${idx++}`); params.push(proxyId); }
    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM test_run t ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    if (cursor) {
      conditions.push(`(t.created_at, t.id) < ($${idx++}, $${idx++})`);
      params.push(cursor.created_at, cursor.id);
    }
    const whereWithCursor = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);
    const query = `SELECT t.*, pe.label as proxy_label, p.name as provider_name
       FROM test_run t
       LEFT JOIN proxy_endpoint pe ON t.proxy_id = pe.id
       LEFT JOIN provider p ON pe.provider_id = p.id
       ${whereWithCursor} ORDER BY t.created_at DESC, t.id DESC LIMIT $${idx}`;

    const result = await pool.query(query, params);
    res.json(buildPaginationResponse(result.rows, limit, totalCount));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/runs/:id
runsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `SELECT t.*, pe.label as proxy_label, p.name as provider_name
       FROM test_run t
       LEFT JOIN proxy_endpoint pe ON t.proxy_id = pe.id
       LEFT JOIN provider p ON pe.provider_id = p.id
       WHERE t.id = $1`,
      [req.params.id],
    );
    if (result.rows.length === 0) {
      logger.warn({ module: 'routes.runs', resource_type: 'run', resource_id: req.params.id }, 'Not found');
      return res.status(404).json({ error: { message: 'Run not found' } });
    }

    // Include latest summary if exists
    const summaryResult = await pool.query('SELECT * FROM run_summary WHERE run_id = $1', [req.params.id]);
    const data = { ...result.rows[0], summary: summaryResult.rows[0] || null };

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/runs/:id/status — Update run status (used by Runner)
runsRouter.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, total_http_samples, total_https_samples, total_ws_samples, error_message } = req.body;

    if (!status) {
      return res.status(400).json({ error: { message: 'status is required' } });
    }

    const runResult = await pool.query('SELECT status FROM test_run WHERE id = $1', [req.params.id]);
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Run not found' } });
    }

    const oldStatus = runResult.rows[0].status;

    const fields: string[] = ['status = $1'];
    const values: any[] = [status];
    let idx = 2;

    if (total_http_samples !== undefined) { fields.push(`total_http_samples = $${idx++}`); values.push(total_http_samples); }
    if (total_https_samples !== undefined) { fields.push(`total_https_samples = $${idx++}`); values.push(total_https_samples); }
    if (total_ws_samples !== undefined) { fields.push(`total_ws_samples = $${idx++}`); values.push(total_ws_samples); }
    if (error_message !== undefined) { fields.push(`error_message = $${idx++}`); values.push(error_message); }

    if (['completed', 'failed', 'cancelled'].includes(status)) {
      fields.push(`finished_at = now()`);
    }

    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE test_run SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    logger.info({ module: 'routes.runs', run_id: req.params.id, old_status: oldStatus, new_status: status }, 'Run status changed');
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/runs/:id
runsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('DELETE FROM test_run WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Run not found' } });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/runs/:id/http-samples/batch — Batch insert HTTP samples
runsRouter.post('/:id/http-samples/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { samples } = req.body;

    if (!samples || !Array.isArray(samples) || samples.length === 0) {
      logger.error({ module: 'routes.runs', run_id: req.params.id, invalid_count: 0, first_error: 'samples array is required' }, 'Batch validation fail');
      return res.status(400).json({ error: { message: 'samples array is required' } });
    }

    if (samples.length > 100) {
      return res.status(400).json({ error: { message: 'Maximum 100 samples per batch' } });
    }

    const runId = req.params.id;

    // Build batch insert
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const s of samples) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(
        runId, s.seq, s.is_warmup || false, s.target_url, s.method || 'GET',
        s.is_https || false, s.status_code || null, s.error_type || null, s.error_message || null,
        s.tcp_connect_ms || null, s.tls_handshake_ms || null, s.ttfb_ms || null, s.total_ms || null,
        s.tls_version || null, s.tls_cipher || null,
        s.bytes_sent || 0, s.bytes_received || 0,
      );
    }

    await pool.query(
      `INSERT INTO http_sample (run_id, seq, is_warmup, target_url, method, is_https, status_code, error_type, error_message, tcp_connect_ms, tls_handshake_ms, ttfb_ms, total_ms, tls_version, tls_cipher, bytes_sent, bytes_received)
       VALUES ${placeholders.join(', ')}`,
      values,
    );

    logger.info({ module: 'routes.runs', run_id: runId, table: 'http_sample', count: samples.length }, 'Batch ingestion');
    res.status(201).json({ inserted: samples.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/runs/:id/ws-samples/batch — Placeholder
runsRouter.post('/:id/ws-samples/batch', async (_req: Request, res: Response) => {
  res.status(201).json({ inserted: 0, message: 'WS samples not implemented in Sprint 1' });
});

// POST /api/v1/runs/:id/ip-checks — Placeholder
runsRouter.post('/:id/ip-checks', async (_req: Request, res: Response) => {
  res.status(201).json({ inserted: 0, message: 'IP checks not implemented in Sprint 1' });
});

// POST /api/v1/runs/:id/summary — Upsert run summary
runsRouter.post('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = req.body;
    const runId = req.params.id;

    // Get proxy_id from run
    const runResult = await pool.query('SELECT proxy_id FROM test_run WHERE id = $1', [runId]);
    if (runResult.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Run not found' } });
    }
    const proxyId = runResult.rows[0].proxy_id;

    const result = await pool.query(
      `INSERT INTO run_summary (
        run_id, proxy_id, http_sample_count, https_sample_count, ws_sample_count,
        http_success_count, http_error_count, uptime_ratio,
        ttfb_avg_ms, ttfb_p50_ms, ttfb_p95_ms, ttfb_p99_ms, ttfb_max_ms,
        total_avg_ms, total_p50_ms, total_p95_ms, total_p99_ms,
        jitter_ms, tls_p50_ms, tls_p95_ms, tls_p99_ms,
        tcp_connect_p50_ms, tcp_connect_p95_ms, tcp_connect_p99_ms,
        ws_success_count, ws_error_count, ws_rtt_avg_ms, ws_rtt_p95_ms, ws_drop_rate, ws_avg_hold_ms,
        total_bytes_sent, total_bytes_received, avg_throughput_bps,
        ip_clean, ip_geo_match, ip_stable,
        score_uptime, score_latency, score_jitter, score_ws, score_security, score_total,
        computed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
        $34, $35, $36, $37, $38, $39, $40, $41, $42, now()
      )
      ON CONFLICT (run_id) DO UPDATE SET
        http_sample_count = EXCLUDED.http_sample_count,
        https_sample_count = EXCLUDED.https_sample_count,
        ws_sample_count = EXCLUDED.ws_sample_count,
        http_success_count = EXCLUDED.http_success_count,
        http_error_count = EXCLUDED.http_error_count,
        uptime_ratio = EXCLUDED.uptime_ratio,
        ttfb_avg_ms = EXCLUDED.ttfb_avg_ms,
        ttfb_p50_ms = EXCLUDED.ttfb_p50_ms,
        ttfb_p95_ms = EXCLUDED.ttfb_p95_ms,
        ttfb_p99_ms = EXCLUDED.ttfb_p99_ms,
        ttfb_max_ms = EXCLUDED.ttfb_max_ms,
        total_avg_ms = EXCLUDED.total_avg_ms,
        total_p50_ms = EXCLUDED.total_p50_ms,
        total_p95_ms = EXCLUDED.total_p95_ms,
        total_p99_ms = EXCLUDED.total_p99_ms,
        jitter_ms = EXCLUDED.jitter_ms,
        tls_p50_ms = EXCLUDED.tls_p50_ms,
        tls_p95_ms = EXCLUDED.tls_p95_ms,
        tls_p99_ms = EXCLUDED.tls_p99_ms,
        tcp_connect_p50_ms = EXCLUDED.tcp_connect_p50_ms,
        tcp_connect_p95_ms = EXCLUDED.tcp_connect_p95_ms,
        tcp_connect_p99_ms = EXCLUDED.tcp_connect_p99_ms,
        ws_success_count = EXCLUDED.ws_success_count,
        ws_error_count = EXCLUDED.ws_error_count,
        ws_rtt_avg_ms = EXCLUDED.ws_rtt_avg_ms,
        ws_rtt_p95_ms = EXCLUDED.ws_rtt_p95_ms,
        ws_drop_rate = EXCLUDED.ws_drop_rate,
        ws_avg_hold_ms = EXCLUDED.ws_avg_hold_ms,
        total_bytes_sent = EXCLUDED.total_bytes_sent,
        total_bytes_received = EXCLUDED.total_bytes_received,
        avg_throughput_bps = EXCLUDED.avg_throughput_bps,
        ip_clean = EXCLUDED.ip_clean,
        ip_geo_match = EXCLUDED.ip_geo_match,
        ip_stable = EXCLUDED.ip_stable,
        score_uptime = EXCLUDED.score_uptime,
        score_latency = EXCLUDED.score_latency,
        score_jitter = EXCLUDED.score_jitter,
        score_ws = EXCLUDED.score_ws,
        score_security = EXCLUDED.score_security,
        score_total = EXCLUDED.score_total,
        computed_at = now()
      RETURNING *`,
      [
        runId, proxyId,
        s.http_sample_count || 0, s.https_sample_count || 0, s.ws_sample_count || 0,
        s.http_success_count || 0, s.http_error_count || 0, s.uptime_ratio ?? null,
        s.ttfb_avg_ms ?? null, s.ttfb_p50_ms ?? null, s.ttfb_p95_ms ?? null, s.ttfb_p99_ms ?? null, s.ttfb_max_ms ?? null,
        s.total_avg_ms ?? null, s.total_p50_ms ?? null, s.total_p95_ms ?? null, s.total_p99_ms ?? null,
        s.jitter_ms ?? null, s.tls_p50_ms ?? null, s.tls_p95_ms ?? null, s.tls_p99_ms ?? null,
        s.tcp_connect_p50_ms ?? null, s.tcp_connect_p95_ms ?? null, s.tcp_connect_p99_ms ?? null,
        s.ws_success_count || 0, s.ws_error_count || 0, s.ws_rtt_avg_ms ?? null, s.ws_rtt_p95_ms ?? null, s.ws_drop_rate ?? null, s.ws_avg_hold_ms ?? null,
        s.total_bytes_sent || 0, s.total_bytes_received || 0, s.avg_throughput_bps ?? null,
        s.ip_clean ?? null, s.ip_geo_match ?? null, s.ip_stable ?? null,
        s.score_uptime ?? null, s.score_latency ?? null, s.score_jitter ?? null, s.score_ws ?? null, s.score_security ?? null, s.score_total ?? null,
      ],
    );

    logger.info({ module: 'routes.runs', run_id: runId, score_total: s.score_total, total_samples: (s.http_sample_count || 0) + (s.https_sample_count || 0) }, 'Summary received');
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/runs/:id/http-samples
runsRouter.get('/:id/http-samples', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, cursor } = parsePagination(req);
    const runId = req.params.id;
    const isWarmup = req.query.is_warmup;
    const isHttps = req.query.is_https;
    const method = req.query.method as string;

    const conditions: string[] = ['run_id = $1'];
    const params: any[] = [runId];
    let idx = 2;

    if (isWarmup !== undefined) { conditions.push(`is_warmup = $${idx++}`); params.push(isWarmup === 'true'); }
    if (isHttps !== undefined) { conditions.push(`is_https = $${idx++}`); params.push(isHttps === 'true'); }
    if (method) { conditions.push(`method = $${idx++}`); params.push(method); }

    const where = conditions.join(' AND ');

    const countResult = await pool.query(`SELECT COUNT(*) FROM http_sample WHERE ${where}`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    if (cursor) {
      conditions.push(`(measured_at, id) < ($${idx++}, $${idx++})`);
      params.push(cursor.created_at, cursor.id);
    }

    params.push(limit + 1);
    const query = `SELECT * FROM http_sample WHERE ${conditions.join(' AND ')} ORDER BY measured_at DESC, id DESC LIMIT $${idx}`;

    const result = await pool.query(query, params);

    // Adapt for pagination (use measured_at as created_at for cursor)
    const rows = result.rows.map((r: any) => ({ ...r, created_at: r.measured_at }));
    res.json(buildPaginationResponse(rows, limit, totalCount));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/runs/:id/summary
runsRouter.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM run_summary WHERE run_id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Summary not found' } });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
