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

type RunConfig struct {
	RunID              string       `json:"run_id"`
	Proxy              ProxyConfig  `json:"proxy"`
	Target             TargetConfig `json:"target"`
	HTTPRPM            int          `json:"http_rpm"`
	HTTPSRPM           int          `json:"https_rpm"`
	WSMessagesPerMin   int          `json:"ws_messages_per_minute"`
	RequestTimeoutMS   int          `json:"request_timeout_ms"`
	WarmupRequests     int          `json:"warmup_requests"`
	SummaryIntervalSec int          `json:"summary_interval_sec"`
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
	HTTPRPM            int `json:"http_rpm"`
	HTTPSRPM           int `json:"https_rpm"`
	WSMessagesPerMin   int `json:"ws_messages_per_minute"`
	RequestTimeoutMS   int `json:"request_timeout_ms"`
	WarmupRequests     int `json:"warmup_requests"`
	SummaryIntervalSec int `json:"summary_interval_sec"`
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
	TotalBytesSent     int64   `json:"total_bytes_sent"`
	TotalBytesReceived int64   `json:"total_bytes_received"`
	AvgThroughputBPS   float64 `json:"avg_throughput_bps"`
	ScoreUptime        float64 `json:"score_uptime"`
	ScoreLatency       float64 `json:"score_latency"`
	ScoreJitter        float64 `json:"score_jitter"`
	ScoreTotal         float64 `json:"score_total"`
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
