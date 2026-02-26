package scoring

import (
	"log/slog"
	"math"

	"proxy-stability-test/runner/internal/domain"
)

// Weights for 5-component scoring
const (
	wUptime   = 0.25
	wLatency  = 0.25
	wJitter   = 0.15
	wWS       = 0.15
	wSecurity = 0.20
)

// ComputeScore calculates the overall score for a run summary
// Sprint 3: 5 components with weight redistribution when phases skipped
func ComputeScore(summary *domain.RunSummary) {
	// S_uptime = success / total
	summary.ScoreUptime = summary.UptimeRatio

	// S_latency = clamp(1 - (ttfb_p95 / 500), 0, 1)
	if summary.TTFBP95MS > 0 {
		summary.ScoreLatency = clamp(1.0-(summary.TTFBP95MS/500.0), 0, 1)
	} else {
		summary.ScoreLatency = 1.0
	}

	// S_jitter = clamp(1 - (jitter / 100), 0, 1)
	if summary.JitterMS > 0 {
		summary.ScoreJitter = clamp(1.0-(summary.JitterMS/100.0), 0, 1)
	} else {
		summary.ScoreJitter = 1.0
	}

	// Determine which phases are active
	hasWS := summary.WSSampleCount > 0
	hasSecurity := summary.IPClean != nil

	// S_ws = 0.4*(1-wsErrorRate) + 0.3*(1-wsDropRate) + 0.3*wsHoldRatio
	if hasWS {
		wsTotal := summary.WSSuccessCount + summary.WSErrorCount
		wsErrorRate := 0.0
		if wsTotal > 0 {
			wsErrorRate = float64(summary.WSErrorCount) / float64(wsTotal)
		}

		wsHoldRatio := 0.0
		if summary.WSAvgHoldMS > 0 {
			// Target hold is 60s = 60000ms
			wsHoldRatio = clamp(summary.WSAvgHoldMS/60000.0, 0, 1)
		}

		summary.ScoreWS = 0.4*(1-wsErrorRate) + 0.3*(1-summary.WSDropRate) + 0.3*wsHoldRatio
	}

	// S_security = 0.30*ipClean + 0.25*geoMatch + 0.25*ipStable + 0.20*tlsScore
	if hasSecurity {
		ipClean := boolToFloat(summary.IPClean)
		geoMatch := boolToFloat(summary.IPGeoMatch)
		ipStable := boolToFloat(summary.IPStable)

		// TLS score: 1.0 if any HTTPS samples succeeded (implies TLS 1.2+)
		tlsScore := 0.0
		if summary.HTTPSSampleCount > 0 && summary.TLSP50MS > 0 {
			tlsScore = 1.0
		}

		summary.ScoreSecurity = 0.30*ipClean + 0.25*geoMatch + 0.25*ipStable + 0.20*tlsScore
	}

	// Weight redistribution
	switch {
	case hasWS && hasSecurity:
		// All 5 components
		summary.ScoreTotal = wUptime*summary.ScoreUptime +
			wLatency*summary.ScoreLatency +
			wJitter*summary.ScoreJitter +
			wWS*summary.ScoreWS +
			wSecurity*summary.ScoreSecurity

	case !hasWS && hasSecurity:
		// WS skipped: redistribute to U, L, J, S
		total := wUptime + wLatency + wJitter + wSecurity // 0.85
		summary.ScoreTotal = (wUptime/total)*summary.ScoreUptime +
			(wLatency/total)*summary.ScoreLatency +
			(wJitter/total)*summary.ScoreJitter +
			(wSecurity/total)*summary.ScoreSecurity

	case hasWS && !hasSecurity:
		// Security skipped: redistribute to U, L, J, WS
		total := wUptime + wLatency + wJitter + wWS // 0.80
		summary.ScoreTotal = (wUptime/total)*summary.ScoreUptime +
			(wLatency/total)*summary.ScoreLatency +
			(wJitter/total)*summary.ScoreJitter +
			(wWS/total)*summary.ScoreWS

	default:
		// Both skipped (Sprint 1/2 compat): U, L, J only
		total := wUptime + wLatency + wJitter // 0.65
		summary.ScoreTotal = (wUptime/total)*summary.ScoreUptime +
			(wLatency/total)*summary.ScoreLatency +
			(wJitter/total)*summary.ScoreJitter
	}

	slog.Info("Score computed",
		"module", "scoring.scorer",
		"phase", "final_summary",
		"run_id", summary.RunID,
		"score_uptime", round(summary.ScoreUptime, 4),
		"score_latency", round(summary.ScoreLatency, 4),
		"score_jitter", round(summary.ScoreJitter, 4),
		"score_ws", round(summary.ScoreWS, 4),
		"score_security", round(summary.ScoreSecurity, 4),
		"score_total", round(summary.ScoreTotal, 4),
		"grade", ComputeGrade(summary.ScoreTotal),
		"has_ws", hasWS,
		"has_security", hasSecurity,
	)
}

// ComputeGrade returns the letter grade for a score
func ComputeGrade(score float64) string {
	switch {
	case score >= 0.90:
		return "A"
	case score >= 0.75:
		return "B"
	case score >= 0.60:
		return "C"
	case score >= 0.40:
		return "D"
	default:
		return "F"
	}
}

func boolToFloat(b *bool) float64 {
	if b == nil || !*b {
		return 0.0
	}
	return 1.0
}

func clamp(val, min, max float64) float64 {
	if val < min {
		return min
	}
	if val > max {
		return max
	}
	return val
}

func round(val float64, places int) float64 {
	p := math.Pow(10, float64(places))
	return math.Round(val*p) / p
}
