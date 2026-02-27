import { pool } from '../db/pool';
import { logger } from '../logger';

export interface RunExport {
  meta: {
    run_id: string;
    proxy_label: string;
    provider_name: string;
    status: string;
    started_at: string;
    stopped_at?: string;
    duration_ms?: number;
    exported_at: string;
    format: 'json' | 'csv';
  };
  summary: Record<string, unknown> | null;
  scoring: {
    score_total: number;
    grade: string;
    components: {
      uptime: { score: number; weight: number };
      latency: { score: number; weight: number };
      jitter: { score: number; weight: number };
      ws: { score: number; weight: number };
      security: { score: number; weight: number };
    };
  } | null;
  http_samples: Record<string, unknown>[];
  ws_samples: Record<string, unknown>[];
  ip_checks: Record<string, unknown>[];
}

function computeGrade(score: number): string {
  if (score >= 0.90) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.60) return 'C';
  if (score >= 0.40) return 'D';
  return 'F';
}

export async function generateJSON(runId: string): Promise<RunExport> {
  const runResult = await pool.query(
    `SELECT t.*, pe.label as proxy_label, p.name as provider_name
     FROM test_run t
     LEFT JOIN proxy_endpoint pe ON t.proxy_id = pe.id
     LEFT JOIN provider p ON pe.provider_id = p.id
     WHERE t.id = $1`,
    [runId],
  );
  if (runResult.rows.length === 0) {
    throw Object.assign(new Error('Run not found'), { statusCode: 404 });
  }

  const run = runResult.rows[0];

  const summaryResult = await pool.query('SELECT * FROM run_summary WHERE run_id = $1', [runId]);
  const summary = summaryResult.rows[0] || null;

  const httpResult = await pool.query(
    'SELECT * FROM http_sample WHERE run_id = $1 AND is_warmup = false ORDER BY seq',
    [runId],
  );

  const wsResult = await pool.query(
    'SELECT * FROM ws_sample WHERE run_id = $1 ORDER BY seq',
    [runId],
  );

  const ipResult = await pool.query(
    'SELECT * FROM ip_check_result WHERE run_id = $1 ORDER BY checked_at',
    [runId],
  );

  if (httpResult.rows.length === 0) {
    logger.warn({ module: 'routes.export', run_id: runId, format: 'json', sample_type: 'http' }, 'Export with zero HTTP samples');
  }
  if (wsResult.rows.length === 0) {
    logger.warn({ module: 'routes.export', run_id: runId, format: 'json', sample_type: 'ws' }, 'Export with zero WS samples');
  }

  let scoring: RunExport['scoring'] = null;
  if (summary && summary.score_total != null) {
    scoring = {
      score_total: summary.score_total,
      grade: computeGrade(summary.score_total),
      components: {
        uptime: { score: summary.score_uptime || 0, weight: 0.25 },
        latency: { score: summary.score_latency || 0, weight: 0.25 },
        jitter: { score: summary.score_jitter || 0, weight: 0.15 },
        ws: { score: summary.score_ws || 0, weight: 0.15 },
        security: { score: summary.score_security || 0, weight: 0.20 },
      },
    };
  }

  const durationMs = run.started_at && run.finished_at
    ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
    : undefined;

  return {
    meta: {
      run_id: runId,
      proxy_label: run.proxy_label || '',
      provider_name: run.provider_name || '',
      status: run.status,
      started_at: run.started_at,
      stopped_at: run.stopped_at || undefined,
      duration_ms: durationMs,
      exported_at: new Date().toISOString(),
      format: 'json',
    },
    summary,
    scoring,
    http_samples: httpResult.rows,
    ws_samples: wsResult.rows,
    ip_checks: ipResult.rows,
  };
}

export async function generateCSV(runId: string): Promise<string> {
  const runResult = await pool.query('SELECT id FROM test_run WHERE id = $1', [runId]);
  if (runResult.rows.length === 0) {
    throw Object.assign(new Error('Run not found'), { statusCode: 404 });
  }

  const result = await pool.query(
    `SELECT seq, method, is_https, target_url, status_code, error_type,
            tcp_connect_ms, tls_handshake_ms, ttfb_ms, total_ms,
            bytes_sent, bytes_received, measured_at
     FROM http_sample
     WHERE run_id = $1 AND is_warmup = false
     ORDER BY seq`,
    [runId],
  );

  if (result.rows.length === 0) {
    logger.warn({ module: 'routes.export', run_id: runId, format: 'csv', sample_type: 'http' }, 'Export with zero HTTP samples');
  }

  const headers = 'seq,method,is_https,target_url,status_code,error_type,tcp_connect_ms,tls_handshake_ms,ttfb_ms,total_ms,bytes_sent,bytes_received,measured_at';

  const rows = result.rows.map((r: Record<string, unknown>) => {
    const vals = [
      r.seq, csvEscape(r.method), r.is_https, csvEscape(r.target_url),
      r.status_code ?? '', csvEscape(r.error_type),
      r.tcp_connect_ms ?? '', r.tls_handshake_ms ?? '', r.ttfb_ms ?? '', r.total_ms ?? '',
      r.bytes_sent ?? 0, r.bytes_received ?? 0, csvEscape(r.measured_at),
    ];
    return vals.join(',');
  });

  return [headers, ...rows].join('\n');
}

function csvEscape(val: unknown): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface ProviderComparison {
  provider_id: string;
  provider_name: string;
  proxy_count: number;
  total_runs: number;
  avg_score_total: number;
  avg_score_uptime: number;
  avg_score_latency: number;
  avg_score_jitter: number;
  avg_score_ws: number;
  avg_score_security: number;
  avg_uptime_ratio: number;
  avg_ttfb_p95_ms: number;
  avg_ws_rtt_ms: number;
  ip_clean_ratio: number;
  geo_match_ratio: number;
  best_grade: string;
  avg_grade: string;
}

export async function compareProviders(providerIds: string[]): Promise<ProviderComparison[]> {
  // Get latest completed run per proxy, then aggregate per provider
  const result = await pool.query(
    `WITH latest_runs AS (
      SELECT DISTINCT ON (pe.id)
        pe.id as proxy_id,
        pe.provider_id,
        p.name as provider_name,
        tr.id as run_id
      FROM proxy_endpoint pe
      JOIN provider p ON pe.provider_id = p.id
      JOIN test_run tr ON tr.proxy_id = pe.id AND tr.status = 'completed'
      WHERE pe.provider_id = ANY($1::uuid[])
      ORDER BY pe.id, tr.finished_at DESC NULLS LAST
    ),
    run_data AS (
      SELECT
        lr.provider_id,
        lr.provider_name,
        rs.*
      FROM latest_runs lr
      JOIN run_summary rs ON rs.run_id = lr.run_id
    )
    SELECT
      rd.provider_id,
      rd.provider_name,
      COUNT(DISTINCT rd.run_id)::int as total_runs,
      (SELECT COUNT(*) FROM proxy_endpoint WHERE provider_id = rd.provider_id)::int as proxy_count,
      COALESCE(AVG(rd.score_total), 0) as avg_score_total,
      COALESCE(AVG(rd.score_uptime), 0) as avg_score_uptime,
      COALESCE(AVG(rd.score_latency), 0) as avg_score_latency,
      COALESCE(AVG(rd.score_jitter), 0) as avg_score_jitter,
      COALESCE(AVG(rd.score_ws), 0) as avg_score_ws,
      COALESCE(AVG(rd.score_security), 0) as avg_score_security,
      COALESCE(AVG(rd.uptime_ratio), 0) as avg_uptime_ratio,
      COALESCE(AVG(rd.ttfb_p95_ms), 0) as avg_ttfb_p95_ms,
      COALESCE(AVG(rd.ws_rtt_avg_ms), 0) as avg_ws_rtt_ms,
      COALESCE(AVG(CASE WHEN rd.ip_clean THEN 1.0 ELSE 0.0 END), 0) as ip_clean_ratio,
      COALESCE(AVG(CASE WHEN rd.ip_geo_match THEN 1.0 ELSE 0.0 END), 0) as geo_match_ratio,
      COALESCE(MAX(rd.score_total), 0) as best_score
    FROM run_data rd
    GROUP BY rd.provider_id, rd.provider_name
    ORDER BY avg_score_total DESC`,
    [providerIds],
  );

  return result.rows.map((r: Record<string, unknown>) => ({
    provider_id: r.provider_id as string,
    provider_name: r.provider_name as string,
    proxy_count: Number(r.proxy_count),
    total_runs: Number(r.total_runs),
    avg_score_total: Number(r.avg_score_total),
    avg_score_uptime: Number(r.avg_score_uptime),
    avg_score_latency: Number(r.avg_score_latency),
    avg_score_jitter: Number(r.avg_score_jitter),
    avg_score_ws: Number(r.avg_score_ws),
    avg_score_security: Number(r.avg_score_security),
    avg_uptime_ratio: Number(r.avg_uptime_ratio),
    avg_ttfb_p95_ms: Number(r.avg_ttfb_p95_ms),
    avg_ws_rtt_ms: Number(r.avg_ws_rtt_ms),
    ip_clean_ratio: Number(r.ip_clean_ratio),
    geo_match_ratio: Number(r.geo_match_ratio),
    best_grade: computeGrade(Number(r.best_score)),
    avg_grade: computeGrade(Number(r.avg_score_total)),
  }));
}
