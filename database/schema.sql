-- =============================================================
-- proxy-stability-test: Full Database Schema
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. provider
CREATE TABLE IF NOT EXISTS provider (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    website         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. proxy_endpoint
CREATE TABLE IF NOT EXISTS proxy_endpoint (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id     UUID NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    host            TEXT NOT NULL,
    port            INT NOT NULL,
    protocol        TEXT NOT NULL DEFAULT 'http'
                    CHECK (protocol IN ('http', 'https', 'socks5')),
    auth_user       TEXT,
    auth_pass_enc   TEXT,
    expected_country TEXT,
    expected_city   TEXT,
    is_dedicated    BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proxy_endpoint_provider ON proxy_endpoint(provider_id);

-- 3. test_run
CREATE TABLE IF NOT EXISTS test_run (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proxy_id                UUID NOT NULL REFERENCES proxy_endpoint(id) ON DELETE CASCADE,
    status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','cancelled','stopping')),
    run_mode                TEXT NOT NULL DEFAULT 'continuous'
                            CHECK (run_mode IN ('continuous', 'fixed')),
    config_snapshot         JSONB NOT NULL DEFAULT '{}',
    target_endpoints        JSONB NOT NULL DEFAULT '[]',
    request_timeout_ms      INT NOT NULL DEFAULT 10000,
    ws_connect_timeout_ms   INT NOT NULL DEFAULT 5000,
    ws_hold_duration_ms     INT NOT NULL DEFAULT 60000,
    http_rpm                INT NOT NULL DEFAULT 500,
    https_rpm               INT NOT NULL DEFAULT 500,
    ws_messages_per_minute  INT NOT NULL DEFAULT 60,
    warmup_requests         INT NOT NULL DEFAULT 5,
    summary_interval_sec    INT NOT NULL DEFAULT 30,
    total_http_samples      INT NOT NULL DEFAULT 0,
    total_https_samples     INT NOT NULL DEFAULT 0,
    total_ws_samples        INT NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ,
    stopped_at              TIMESTAMPTZ,
    finished_at             TIMESTAMPTZ,
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_run_proxy ON test_run(proxy_id);
CREATE INDEX IF NOT EXISTS idx_test_run_status ON test_run(status);

-- 4. http_sample
CREATE TABLE IF NOT EXISTS http_sample (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    seq             INT NOT NULL,
    is_warmup       BOOLEAN NOT NULL DEFAULT false,
    target_url      TEXT NOT NULL,
    method          TEXT NOT NULL DEFAULT 'GET',
    is_https        BOOLEAN NOT NULL DEFAULT false,
    status_code     INT,
    error_type      TEXT,
    error_message   TEXT,
    tcp_connect_ms      DOUBLE PRECISION,
    tls_handshake_ms    DOUBLE PRECISION,
    ttfb_ms             DOUBLE PRECISION,
    total_ms            DOUBLE PRECISION,
    tls_version     TEXT,
    tls_cipher      TEXT,
    bytes_sent      BIGINT DEFAULT 0,
    bytes_received  BIGINT DEFAULT 0,
    measured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_http_sample_run ON http_sample(run_id);

-- 5. ws_sample
CREATE TABLE IF NOT EXISTS ws_sample (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id              UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    seq                 INT NOT NULL,
    is_warmup           BOOLEAN NOT NULL DEFAULT false,
    target_url          TEXT NOT NULL,
    connected           BOOLEAN NOT NULL DEFAULT false,
    error_type          TEXT,
    error_message       TEXT,
    tcp_connect_ms      DOUBLE PRECISION,
    tls_handshake_ms    DOUBLE PRECISION,
    handshake_ms        DOUBLE PRECISION,
    message_rtt_ms      DOUBLE PRECISION,
    started_at          TIMESTAMPTZ,
    connection_held_ms  DOUBLE PRECISION,
    disconnect_reason   TEXT,
    messages_sent       INT NOT NULL DEFAULT 0,
    messages_received   INT NOT NULL DEFAULT 0,
    drop_count          INT NOT NULL DEFAULT 0,
    measured_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ws_sample_run ON ws_sample(run_id);

-- 6. ip_check_result
CREATE TABLE IF NOT EXISTS ip_check_result (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID NOT NULL REFERENCES test_run(id) ON DELETE CASCADE,
    proxy_id        UUID NOT NULL REFERENCES proxy_endpoint(id) ON DELETE CASCADE,
    observed_ip         INET NOT NULL,
    expected_country    TEXT,
    actual_country      TEXT,
    actual_region       TEXT,
    actual_city         TEXT,
    geo_match           BOOLEAN,
    blacklist_checked   BOOLEAN NOT NULL DEFAULT false,
    blacklists_queried  INT NOT NULL DEFAULT 0,
    blacklists_listed   INT NOT NULL DEFAULT 0,
    blacklist_sources   JSONB DEFAULT '[]',
    is_clean            BOOLEAN,
    ip_stable           BOOLEAN,
    ip_changes          INT NOT NULL DEFAULT 0,
    checked_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_check_run ON ip_check_result(run_id);

-- 7. run_summary
CREATE TABLE IF NOT EXISTS run_summary (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id          UUID NOT NULL UNIQUE REFERENCES test_run(id) ON DELETE CASCADE,
    proxy_id        UUID NOT NULL REFERENCES proxy_endpoint(id) ON DELETE CASCADE,
    http_sample_count   INT NOT NULL DEFAULT 0,
    https_sample_count  INT NOT NULL DEFAULT 0,
    ws_sample_count     INT NOT NULL DEFAULT 0,
    http_success_count  INT NOT NULL DEFAULT 0,
    http_error_count    INT NOT NULL DEFAULT 0,
    uptime_ratio        DOUBLE PRECISION,
    ttfb_avg_ms         DOUBLE PRECISION,
    ttfb_p50_ms         DOUBLE PRECISION,
    ttfb_p95_ms         DOUBLE PRECISION,
    ttfb_p99_ms         DOUBLE PRECISION,
    ttfb_max_ms         DOUBLE PRECISION,
    total_avg_ms        DOUBLE PRECISION,
    total_p50_ms        DOUBLE PRECISION,
    total_p95_ms        DOUBLE PRECISION,
    total_p99_ms        DOUBLE PRECISION,
    jitter_ms           DOUBLE PRECISION,
    tls_p50_ms          DOUBLE PRECISION,
    tls_p95_ms          DOUBLE PRECISION,
    tls_p99_ms          DOUBLE PRECISION,
    tcp_connect_p50_ms  DOUBLE PRECISION,
    tcp_connect_p95_ms  DOUBLE PRECISION,
    tcp_connect_p99_ms  DOUBLE PRECISION,
    ws_success_count    INT NOT NULL DEFAULT 0,
    ws_error_count      INT NOT NULL DEFAULT 0,
    ws_rtt_avg_ms       DOUBLE PRECISION,
    ws_rtt_p95_ms       DOUBLE PRECISION,
    ws_drop_rate        DOUBLE PRECISION,
    ws_avg_hold_ms      DOUBLE PRECISION,
    total_bytes_sent        BIGINT DEFAULT 0,
    total_bytes_received    BIGINT DEFAULT 0,
    avg_throughput_bps      DOUBLE PRECISION,
    ip_clean            BOOLEAN,
    ip_geo_match        BOOLEAN,
    ip_stable           BOOLEAN,
    score_uptime        DOUBLE PRECISION,
    score_latency       DOUBLE PRECISION,
    score_jitter        DOUBLE PRECISION,
    score_ws            DOUBLE PRECISION,
    score_security      DOUBLE PRECISION,
    score_total         DOUBLE PRECISION,
    ip_clean_score          DOUBLE PRECISION,
    majority_tls_version    VARCHAR(20),
    tls_version_score       DOUBLE PRECISION,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_summary_proxy ON run_summary(proxy_id);
CREATE INDEX IF NOT EXISTS idx_run_summary_score ON run_summary(score_total DESC);
