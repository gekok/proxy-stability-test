package domain

import (
	"fmt"
	"time"
)

type ProxyConfig struct {
	Host            string `json:"host"`
	Port            int    `json:"port"`
	Protocol        string `json:"protocol"`
	AuthUser        string `json:"auth_user"`
	AuthPass        string `json:"auth_pass"`
	ExpectedCountry string `json:"expected_country"`
	Label           string `json:"label"`
}

type TargetConfig struct {
	HTTPURL  string `json:"http_url"`
	HTTPSURL string `json:"https_url"`
}

type BurstConfig struct {
	IntervalSec int `json:"interval_sec"` // seconds between bursts (default 300 = 5min)
	Concurrency int `json:"concurrency"`  // goroutines per burst (default 100)
}

type RunConfig struct {
	RunID              string        `json:"run_id"`
	Proxy              ProxyConfig   `json:"proxy"`
	Target             TargetConfig  `json:"target"`
	HTTPRPM            int           `json:"http_rpm"`
	HTTPSRPM           int           `json:"https_rpm"`
	WSMessagesPerMin   int           `json:"ws_messages_per_minute"`
	RequestTimeoutMS   int           `json:"request_timeout_ms"`
	WarmupRequests     int           `json:"warmup_requests"`
	SummaryIntervalSec int           `json:"summary_interval_sec"`
	Burst              *BurstConfig  `json:"burst,omitempty"`
	ScoringCfg         ScoringConfig `json:"scoring_config"`
}

type TriggerPayload struct {
	Runs []TriggerRun `json:"runs"`
}

type TriggerRun struct {
	RunID  string       `json:"run_id"`
	Proxy  ProxyConfig  `json:"proxy"`
	Config TriggerRunConfig `json:"config"`
	Target TargetConfig `json:"target"`
}

type TriggerRunConfig struct {
	HTTPRPM            int            `json:"http_rpm"`
	HTTPSRPM           int            `json:"https_rpm"`
	WSMessagesPerMin   int            `json:"ws_messages_per_minute"`
	RequestTimeoutMS   int            `json:"request_timeout_ms"`
	WarmupRequests     int            `json:"warmup_requests"`
	SummaryIntervalSec int            `json:"summary_interval_sec"`
	ScoringConfig      *ScoringConfig `json:"scoring_config,omitempty"`
}

type ScoringConfig struct {
	LatencyThresholdMs float64 `json:"latency_threshold_ms"`
	JitterThresholdMs  float64 `json:"jitter_threshold_ms"`
	WSHoldTargetMs     float64 `json:"ws_hold_target_ms"`
	IPCheckIntervalSec int     `json:"ip_check_interval_sec"`
}

func DefaultScoringConfig() ScoringConfig {
	return ScoringConfig{
		LatencyThresholdMs: 500,
		JitterThresholdMs:  100,
		WSHoldTargetMs:     60000,
		IPCheckIntervalSec: 60,
	}
}

type HTTPSample struct {
	Seq            int       `json:"seq"`
	IsWarmup       bool      `json:"is_warmup"`
	TargetURL      string    `json:"target_url"`
	Method         string    `json:"method"`
	IsHTTPS        bool      `json:"is_https"`
	StatusCode     int       `json:"status_code,omitempty"`
	ErrorType      string    `json:"error_type,omitempty"`
	ErrorMessage   string    `json:"error_message,omitempty"`
	TCPConnectMS   float64   `json:"tcp_connect_ms"`
	TLSHandshakeMS float64   `json:"tls_handshake_ms,omitempty"`
	TTFBMS         float64   `json:"ttfb_ms"`
	TotalMS        float64   `json:"total_ms"`
	TLSVersion     string    `json:"tls_version,omitempty"`
	TLSCipher      string    `json:"tls_cipher,omitempty"`
	BytesSent      int64     `json:"bytes_sent"`
	BytesReceived  int64     `json:"bytes_received"`
	MeasuredAt     time.Time `json:"measured_at"`
}

type WSSample struct {
	Seq              int       `json:"seq"`
	IsWarmup         bool      `json:"is_warmup"`
	TargetURL        string    `json:"target_url"`
	Connected        bool      `json:"connected"`
	IsWSS            bool      `json:"is_wss"`
	ErrorType        string    `json:"error_type,omitempty"`
	ErrorMessage     string    `json:"error_message,omitempty"`
	TCPConnectMS     float64   `json:"tcp_connect_ms"`
	TLSHandshakeMS   float64   `json:"tls_handshake_ms,omitempty"`
	HandshakeMS      float64   `json:"handshake_ms"`
	MessageRTTMS     float64   `json:"message_rtt_ms"`
	ConnectionHeldMS float64   `json:"connection_held_ms"`
	DisconnectReason string    `json:"disconnect_reason,omitempty"`
	MessagesSent     int       `json:"messages_sent"`
	MessagesReceived int       `json:"messages_received"`
	DropCount        int       `json:"drop_count"`
	MeasuredAt       time.Time `json:"measured_at"`
}

type IPCheckResult struct {
	RunID            string   `json:"run_id"`
	ProxyID          string   `json:"proxy_id"`
	ObservedIP       string   `json:"observed_ip"`
	ExpectedCountry  string   `json:"expected_country"`
	ActualCountry    string   `json:"actual_country"`
	ActualRegion     string   `json:"actual_region"`
	ActualCity       string   `json:"actual_city"`
	GeoMatch         bool     `json:"geo_match"`
	BlacklistChecked bool     `json:"blacklist_checked"`
	BlacklistQueried int      `json:"blacklists_queried"`
	BlacklistListed  int      `json:"blacklists_listed"`
	BlacklistSources []string `json:"blacklist_sources"`
	IsClean          bool     `json:"is_clean"`
	IPStable         bool     `json:"ip_stable"`
	IPChanges        int      `json:"ip_changes"`
}

type RunSummary struct {
	RunID              string  `json:"run_id"`
	HTTPSampleCount    int     `json:"http_sample_count"`
	HTTPSSampleCount   int     `json:"https_sample_count"`
	WSSampleCount      int     `json:"ws_sample_count"`
	HTTPSuccessCount   int     `json:"http_success_count"`
	HTTPErrorCount     int     `json:"http_error_count"`
	UptimeRatio        float64 `json:"uptime_ratio"`
	TTFBAvgMS          float64 `json:"ttfb_avg_ms"`
	TTFBP50MS          float64 `json:"ttfb_p50_ms"`
	TTFBP95MS          float64 `json:"ttfb_p95_ms"`
	TTFBP99MS          float64 `json:"ttfb_p99_ms"`
	TTFBMaxMS          float64 `json:"ttfb_max_ms"`
	TotalAvgMS         float64 `json:"total_avg_ms"`
	TotalP50MS         float64 `json:"total_p50_ms"`
	TotalP95MS         float64 `json:"total_p95_ms"`
	TotalP99MS         float64 `json:"total_p99_ms"`
	JitterMS           float64 `json:"jitter_ms"`
	TLSP50MS           float64 `json:"tls_p50_ms"`
	TLSP95MS           float64 `json:"tls_p95_ms"`
	TLSP99MS           float64 `json:"tls_p99_ms"`
	TCPConnectP50MS    float64 `json:"tcp_connect_p50_ms"`
	TCPConnectP95MS    float64 `json:"tcp_connect_p95_ms"`
	TCPConnectP99MS    float64 `json:"tcp_connect_p99_ms"`
	// WS metrics
	WSSuccessCount int     `json:"ws_success_count"`
	WSErrorCount   int     `json:"ws_error_count"`
	WSRTTAvgMS     float64 `json:"ws_rtt_avg_ms"`
	WSRTTP95MS     float64 `json:"ws_rtt_p95_ms"`
	WSDropRate     float64 `json:"ws_drop_rate"`
	WSAvgHoldMS    float64 `json:"ws_avg_hold_ms"`
	// Bytes
	TotalBytesSent     int64   `json:"total_bytes_sent"`
	TotalBytesReceived int64   `json:"total_bytes_received"`
	AvgThroughputBPS   float64 `json:"avg_throughput_bps"`
	// IP check
	IPClean    *bool `json:"ip_clean"`
	IPGeoMatch *bool `json:"ip_geo_match"`
	IPStable   *bool `json:"ip_stable"`
	// Sprint 4: new fields
	IPCleanScore       float64 `json:"ip_clean_score"`
	MajorityTLSVersion string  `json:"majority_tls_version,omitempty"`
	TLSVersionScore    float64 `json:"tls_version_score"`
	// Scores
	ScoreUptime   float64 `json:"score_uptime"`
	ScoreLatency  float64 `json:"score_latency"`
	ScoreJitter   float64 `json:"score_jitter"`
	ScoreWS       float64 `json:"score_ws"`
	ScoreSecurity float64 `json:"score_security"`
	ScoreTotal    float64 `json:"score_total"`
}

// MethodTarget defines an endpoint + method combination for testing
type MethodTarget struct {
	Method string
	Path   string
	Body   func(seq int) []byte
}

// Standard method rotation for HTTP/HTTPS testing
var MethodRotation = []MethodTarget{
	{Method: "GET", Path: "/echo", Body: nil},
	{Method: "POST", Path: "/echo", Body: func(seq int) []byte {
		return []byte(`{"test":true,"seq":` + itoa(seq) + `}`)
	}},
	{Method: "PUT", Path: "/echo", Body: func(seq int) []byte {
		return []byte(`{"update":true,"seq":` + itoa(seq) + `}`)
	}},
	{Method: "PATCH", Path: "/echo", Body: func(seq int) []byte {
		return []byte(`{"patch":"field_x","seq":` + itoa(seq) + `}`)
	}},
	{Method: "DELETE", Path: "/echo", Body: nil},
	{Method: "HEAD", Path: "/echo", Body: nil},
}

func itoa(i int) string {
	return fmt.Sprintf("%d", i)
}
