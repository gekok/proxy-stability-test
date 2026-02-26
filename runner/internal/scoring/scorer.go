package scoring

import (
	"log/slog"
	"math"

	"proxy-stability-test/runner/internal/domain"
)

// ComputeScore calculates the overall score for a run summary
// Sprint 1: 3 components only (Uptime, Latency, Jitter)
// Weight redistribution: 0.385*U + 0.385*L + 0.230*J
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

	// Sprint 1: redistribute weights (no WS or Security)
	// Original: U=0.25, L=0.25, J=0.15 → total=0.65
	// Normalized: U=0.385, L=0.385, J=0.230
	totalWeight := 0.25 + 0.25 + 0.15 // = 0.65
	summary.ScoreTotal = (0.25/totalWeight)*summary.ScoreUptime +
		(0.25/totalWeight)*summary.ScoreLatency +
		(0.15/totalWeight)*summary.ScoreJitter

	slog.Info("Score computed",
		"module", "scoring.scorer",
		"phase", "final_summary",
		"run_id", summary.RunID,
		"score_uptime", round(summary.ScoreUptime, 4),
		"score_latency", round(summary.ScoreLatency, 4),
		"score_jitter", round(summary.ScoreJitter, 4),
		"score_total", round(summary.ScoreTotal, 4),
		"grade", ComputeGrade(summary.ScoreTotal),
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
