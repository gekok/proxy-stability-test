-- Sprint 4: Scoring improvements
-- Adds gradient IP clean score, TLS version tracking, TLS version score

ALTER TABLE run_summary ADD COLUMN IF NOT EXISTS ip_clean_score DOUBLE PRECISION;
ALTER TABLE run_summary ADD COLUMN IF NOT EXISTS majority_tls_version VARCHAR(20);
ALTER TABLE run_summary ADD COLUMN IF NOT EXISTS tls_version_score DOUBLE PRECISION;
