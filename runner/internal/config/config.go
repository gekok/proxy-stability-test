package config

import (
	"proxy-stability-test/runner/internal/domain"
)

// Defaults for run configuration
const (
	DefaultHTTPRPM            = 500
	DefaultHTTPSRPM           = 500
	DefaultWSMessagesPerMin   = 60
	DefaultRequestTimeoutMS   = 10000
	DefaultWarmupRequests     = 5
	DefaultSummaryIntervalSec = 30
)

// FromTrigger converts a trigger run payload to a RunConfig
func FromTrigger(tr domain.TriggerRun) domain.RunConfig {
	cfg := domain.RunConfig{
		RunID:  tr.RunID,
		Proxy:  tr.Proxy,
		Target: tr.Target,
	}

	cfg.HTTPRPM = withDefault(tr.Config.HTTPRPM, DefaultHTTPRPM)
	cfg.HTTPSRPM = withDefault(tr.Config.HTTPSRPM, DefaultHTTPSRPM)
	cfg.WSMessagesPerMin = withDefault(tr.Config.WSMessagesPerMin, DefaultWSMessagesPerMin)
	cfg.RequestTimeoutMS = withDefault(tr.Config.RequestTimeoutMS, DefaultRequestTimeoutMS)
	cfg.WarmupRequests = withDefault(tr.Config.WarmupRequests, DefaultWarmupRequests)
	cfg.SummaryIntervalSec = withDefault(tr.Config.SummaryIntervalSec, DefaultSummaryIntervalSec)

	// Parse scoring config, use defaults for zero values
	sc := domain.DefaultScoringConfig()
	if tr.Config.ScoringConfig != nil {
		if tr.Config.ScoringConfig.LatencyThresholdMs > 0 {
			sc.LatencyThresholdMs = tr.Config.ScoringConfig.LatencyThresholdMs
		}
		if tr.Config.ScoringConfig.JitterThresholdMs > 0 {
			sc.JitterThresholdMs = tr.Config.ScoringConfig.JitterThresholdMs
		}
		if tr.Config.ScoringConfig.WSHoldTargetMs > 0 {
			sc.WSHoldTargetMs = tr.Config.ScoringConfig.WSHoldTargetMs
		}
		if tr.Config.ScoringConfig.IPCheckIntervalSec > 0 {
			sc.IPCheckIntervalSec = tr.Config.ScoringConfig.IPCheckIntervalSec
		}
	}
	cfg.ScoringCfg = sc

	return cfg
}

func withDefault(val, def int) int {
	if val <= 0 {
		return def
	}
	return val
}
