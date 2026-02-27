export interface Provider {
  id: string;
  name: string;
  website?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProxyEndpoint {
  id: string;
  provider_id: string;
  label: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks5';
  auth_user?: string | null;
  auth_pass_enc?: string | null;
  expected_country?: string | null;
  expected_city?: string | null;
  is_dedicated: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestRun {
  id: string;
  proxy_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stopping';
  run_mode: 'continuous' | 'fixed';
  config_snapshot: Record<string, unknown>;
  target_endpoints: string[];
  request_timeout_ms: number;
  ws_connect_timeout_ms: number;
  ws_hold_duration_ms: number;
  http_rpm: number;
  https_rpm: number;
  ws_messages_per_minute: number;
  warmup_requests: number;
  summary_interval_sec: number;
  total_http_samples: number;
  total_https_samples: number;
  total_ws_samples: number;
  started_at?: string | null;
  stopped_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface HttpSample {
  id: string;
  run_id: string;
  seq: number;
  is_warmup: boolean;
  target_url: string;
  method: string;
  is_https: boolean;
  status_code?: number | null;
  error_type?: string | null;
  error_message?: string | null;
  tcp_connect_ms?: number | null;
  tls_handshake_ms?: number | null;
  ttfb_ms?: number | null;
  total_ms?: number | null;
  tls_version?: string | null;
  tls_cipher?: string | null;
  bytes_sent: number;
  bytes_received: number;
  measured_at: string;
}

export interface RunSummary {
  id: string;
  run_id: string;
  proxy_id: string;
  http_sample_count: number;
  https_sample_count: number;
  ws_sample_count: number;
  http_success_count: number;
  http_error_count: number;
  uptime_ratio?: number | null;
  ttfb_avg_ms?: number | null;
  ttfb_p50_ms?: number | null;
  ttfb_p95_ms?: number | null;
  ttfb_p99_ms?: number | null;
  ttfb_max_ms?: number | null;
  total_avg_ms?: number | null;
  total_p50_ms?: number | null;
  total_p95_ms?: number | null;
  total_p99_ms?: number | null;
  jitter_ms?: number | null;
  tls_p50_ms?: number | null;
  tls_p95_ms?: number | null;
  tls_p99_ms?: number | null;
  tcp_connect_p50_ms?: number | null;
  tcp_connect_p95_ms?: number | null;
  tcp_connect_p99_ms?: number | null;
  ws_success_count: number;
  ws_error_count: number;
  ws_rtt_avg_ms?: number | null;
  ws_rtt_p95_ms?: number | null;
  ws_drop_rate?: number | null;
  ws_avg_hold_ms?: number | null;
  total_bytes_sent: number;
  total_bytes_received: number;
  avg_throughput_bps?: number | null;
  ip_clean?: boolean | null;
  ip_geo_match?: boolean | null;
  ip_stable?: boolean | null;
  score_uptime?: number | null;
  score_latency?: number | null;
  score_jitter?: number | null;
  score_ws?: number | null;
  score_security?: number | null;
  score_total?: number | null;
  ip_clean_score?: number | null;
  majority_tls_version?: string | null;
  tls_version_score?: number | null;
  computed_at: string;
}

export interface PaginationResult {
  has_more: boolean;
  next_cursor: string | null;
  total_count: number;
}

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
  summary: RunSummary | null;
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
  http_samples: HttpSample[];
  ws_samples: unknown[];
  ip_checks: unknown[];
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

export interface ScoringConfig {
  latency_threshold_ms: number;
  jitter_threshold_ms: number;
  ws_hold_target_ms: number;
  ip_check_interval_sec: number;
}
