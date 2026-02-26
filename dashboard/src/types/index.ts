// === Provider ===
export interface Provider {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderCreate {
  name: string;
  website?: string;
  notes?: string;
}

export interface ProviderUpdate {
  name?: string;
  website?: string;
  notes?: string;
}

// === Proxy ===
export interface Proxy {
  id: string;
  provider_id: string;
  provider_name?: string;
  label: string;
  host: string;
  port: number;
  protocol: 'http' | 'socks5';
  auth_user: string | null;
  has_password?: boolean;
  expected_country: string | null;
  expected_city?: string | null;
  is_dedicated: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProxyCreate {
  provider_id: string;
  label: string;
  host: string;
  port: number;
  protocol: 'http' | 'socks5';
  auth_user?: string;
  auth_pass?: string;
  expected_country?: string;
  is_dedicated?: boolean;
}

export interface ProxyUpdate {
  label?: string;
  host?: string;
  port?: number;
  protocol?: 'http' | 'socks5';
  auth_user?: string;
  auth_pass?: string;
  expected_country?: string;
  is_dedicated?: boolean;
}

// === Test Run ===
export type RunStatus = 'pending' | 'running' | 'stopping' | 'completed' | 'failed' | 'cancelled';

export interface TestRun {
  id: string;
  proxy_id: string;
  proxy_label?: string;
  provider_name?: string;
  status: RunStatus;
  config_snapshot: RunConfig;
  started_at: string | null;
  stopped_at: string | null;
  finished_at: string | null;
  total_http_samples: number;
  total_https_samples: number;
  total_ws_samples: number;
  error_message: string | null;
  created_at: string;
  updated_at?: string;
}

export interface RunConfig {
  http_rpm: number;
  https_rpm: number;
  timeout_ms: number;
  warmup_requests: number;
}

export interface RunCreate {
  proxy_id: string;
  config?: Partial<RunConfig>;
}

// === Run Summary ===
export interface RunSummary {
  id: string;
  run_id: string;
  proxy_id: string;
  http_sample_count: number;
  https_sample_count: number;
  ws_sample_count: number;
  http_success_count: number;
  http_error_count: number;
  uptime_ratio: number | null;
  ttfb_avg_ms: number | null;
  ttfb_p50_ms: number | null;
  ttfb_p95_ms: number | null;
  ttfb_p99_ms: number | null;
  ttfb_max_ms: number | null;
  total_avg_ms: number | null;
  total_p50_ms: number | null;
  total_p95_ms: number | null;
  total_p99_ms: number | null;
  jitter_ms: number | null;
  tls_p50_ms: number | null;
  tls_p95_ms: number | null;
  tls_p99_ms: number | null;
  tcp_connect_p50_ms: number | null;
  tcp_connect_p95_ms: number | null;
  tcp_connect_p99_ms: number | null;
  ws_success_count: number;
  ws_error_count: number;
  ws_rtt_avg_ms: number | null;
  ws_rtt_p95_ms: number | null;
  ws_drop_rate: number | null;
  ws_avg_hold_ms: number | null;
  total_bytes_sent: number;
  total_bytes_received: number;
  avg_throughput_bps: number | null;
  ip_clean: boolean | null;
  ip_geo_match: boolean | null;
  ip_stable: boolean | null;
  score_uptime: number | null;
  score_latency: number | null;
  score_jitter: number | null;
  score_ws: number | null;
  score_security: number | null;
  score_total: number | null;
  computed_at: string;
}

// === HTTP Sample ===
export interface HttpSample {
  id: string;
  run_id: string;
  seq: number;
  method: string;
  is_https: boolean;
  is_warmup: boolean;
  status_code: number | null;
  tcp_connect_ms: number | null;
  tls_handshake_ms: number | null;
  ttfb_ms: number | null;
  total_ms: number | null;
  bytes_sent: number;
  bytes_received: number;
  error_type: string | null;
  error_message: string | null;
  tls_version: string | null;
  tls_cipher: string | null;
  measured_at: string;
}

// === WS Sample ===
export interface WsSample {
  id: string;
  run_id: string;
  seq: number;
  target_url: string;
  connected: boolean;
  error_type: string | null;
  error_message: string | null;
  tcp_connect_ms: number | null;
  tls_handshake_ms: number | null;
  handshake_ms: number | null;
  message_rtt_ms: number | null;
  connection_held_ms: number | null;
  disconnect_reason: string | null;
  messages_sent: number;
  messages_received: number;
  drop_count: number;
  measured_at: string;
}

// === IP Check Result ===
export interface IPCheckResult {
  id: string;
  run_id: string;
  proxy_id: string;
  observed_ip: string;
  expected_country: string | null;
  actual_country: string | null;
  actual_region: string | null;
  actual_city: string | null;
  geo_match: boolean | null;
  blacklist_checked: boolean;
  blacklists_queried: number;
  blacklists_listed: number;
  blacklist_sources: string[];
  is_clean: boolean | null;
  ip_stable: boolean | null;
  ip_changes: number;
  checked_at: string;
}

// === Default Config ===
export const DEFAULT_RUN_CONFIG: RunConfig = {
  http_rpm: 500,
  https_rpm: 500,
  timeout_ms: 10000,
  warmup_requests: 5,
};

// === Pagination ===
export interface PaginationInfo {
  has_more: boolean;
  next_cursor: string | null;
  total_count: number;
}

// === Score helpers ===
export function getScoreColor(score: number): 'good' | 'warning' | 'bad' {
  if (score >= 0.8) return 'good';
  if (score >= 0.5) return 'warning';
  return 'bad';
}

export function getScoreGrade(score: number): string {
  if (score >= 0.9) return 'A';
  if (score >= 0.75) return 'B';
  if (score >= 0.6) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

export function getStatusBadgeVariant(status: RunStatus) {
  switch (status) {
    case 'running':   return { variant: 'success' as const, pulse: true };
    case 'stopping':  return { variant: 'warning' as const, pulse: true };
    case 'completed': return { variant: 'info' as const,    pulse: false };
    case 'failed':    return { variant: 'error' as const,   pulse: false };
    case 'pending':   return { variant: 'neutral' as const, pulse: false };
    case 'cancelled': return { variant: 'default' as const, pulse: false };
  }
}

// === Duration helpers ===
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
