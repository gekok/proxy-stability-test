package engine

import (
	"log/slog"
	"math"
	"sort"
	"sync"

	"proxy-stability-test/runner/internal/domain"
)

// ResultCollector aggregates HTTP samples and computes summaries
type ResultCollector struct {
	mu          sync.RWMutex
	httpSamples []domain.HTTPSample
	logger      *slog.Logger
	runID       string
}

// NewResultCollector creates a new result collector
func NewResultCollector(runID string, logger *slog.Logger) *ResultCollector {
	return &ResultCollector{
		runID:  runID,
		logger: logger.With("module", "engine.result_collector"),
	}
}

// Add adds a sample to the collector
func (c *ResultCollector) Add(sample domain.HTTPSample) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.httpSamples = append(c.httpSamples, sample)
}

// AddBatch adds multiple samples at once
func (c *ResultCollector) AddBatch(samples []domain.HTTPSample) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.httpSamples = append(c.httpSamples, samples...)
}

// GetPendingSamples returns and drains non-warmup samples for reporting
func (c *ResultCollector) GetPendingSamples(batchSize int) []domain.HTTPSample {
	c.mu.Lock()
	defer c.mu.Unlock()

	n := len(c.httpSamples)
	if n == 0 {
		return nil
	}

	if batchSize > n {
		batchSize = n
	}

	batch := make([]domain.HTTPSample, batchSize)
	copy(batch, c.httpSamples[:batchSize])
	c.httpSamples = c.httpSamples[batchSize:]
	return batch
}

// TotalSamples returns the total count of all samples collected
func (c *ResultCollector) TotalSamples() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.httpSamples)
}

// ComputeSummary computes a RunSummary from all collected non-warmup samples
func (c *ResultCollector) ComputeSummary(allSamples []domain.HTTPSample) domain.RunSummary {
	// Filter out warmup samples
	var valid []domain.HTTPSample
	var httpCount, httpsCount int
	var successCount, errorCount int
	var totalBytesSent, totalBytesReceived int64

	for _, s := range allSamples {
		if s.IsWarmup {
			continue
		}
		valid = append(valid, s)
		if s.IsHTTPS {
			httpsCount++
		} else {
			httpCount++
		}
		if s.ErrorType == "" {
			successCount++
		} else {
			errorCount++
		}
		totalBytesSent += s.BytesSent
		totalBytesReceived += s.BytesReceived
	}

	summary := domain.RunSummary{
		RunID:              c.runID,
		HTTPSampleCount:    httpCount,
		HTTPSSampleCount:   httpsCount,
		HTTPSuccessCount:   successCount,
		HTTPErrorCount:     errorCount,
		TotalBytesSent:     totalBytesSent,
		TotalBytesReceived: totalBytesReceived,
	}

	if len(valid) == 0 {
		c.logger.Warn("No samples for metric",
			"phase", "continuous",
			"run_id", c.runID,
		)
		return summary
	}

	// Uptime ratio
	summary.UptimeRatio = float64(successCount) / float64(len(valid))

	// Sprint 4: compute majority TLS version
	tlsVersionCounts := make(map[string]int)
	for _, s := range valid {
		if s.IsHTTPS && s.TLSVersion != "" && s.ErrorType == "" {
			tlsVersionCounts[s.TLSVersion]++
		}
	}
	if len(tlsVersionCounts) > 0 {
		maxCount := 0
		for ver, count := range tlsVersionCounts {
			if count > maxCount {
				maxCount = count
				summary.MajorityTLSVersion = ver
			}
		}
	}

	// Extract timing fields
	var ttfbs, totals, tcpConnects, tlsHandshakes []float64
	for _, s := range valid {
		if s.ErrorType == "" {
			if s.TTFBMS > 0 {
				ttfbs = append(ttfbs, s.TTFBMS)
			}
			if s.TotalMS > 0 {
				totals = append(totals, s.TotalMS)
			}
			if s.TCPConnectMS > 0 {
				tcpConnects = append(tcpConnects, s.TCPConnectMS)
			}
			if s.TLSHandshakeMS > 0 {
				tlsHandshakes = append(tlsHandshakes, s.TLSHandshakeMS)
			}
		}
	}

	// TTFB percentiles
	if len(ttfbs) > 0 {
		summary.TTFBAvgMS = mean(ttfbs)
		summary.TTFBP50MS = percentile(ttfbs, 50)
		summary.TTFBP95MS = percentile(ttfbs, 95)
		summary.TTFBP99MS = percentile(ttfbs, 99)
		summary.TTFBMaxMS = max(ttfbs)
	}

	// Total duration percentiles
	if len(totals) > 0 {
		summary.TotalAvgMS = mean(totals)
		summary.TotalP50MS = percentile(totals, 50)
		summary.TotalP95MS = percentile(totals, 95)
		summary.TotalP99MS = percentile(totals, 99)
	}

	// Jitter (stddev of total_ms)
	if len(totals) > 1 {
		summary.JitterMS = stddev(totals)
	}

	// TLS handshake percentiles
	if len(tlsHandshakes) > 0 {
		summary.TLSP50MS = percentile(tlsHandshakes, 50)
		summary.TLSP95MS = percentile(tlsHandshakes, 95)
		summary.TLSP99MS = percentile(tlsHandshakes, 99)
	}

	// TCP connect percentiles
	if len(tcpConnects) > 0 {
		summary.TCPConnectP50MS = percentile(tcpConnects, 50)
		summary.TCPConnectP95MS = percentile(tcpConnects, 95)
		summary.TCPConnectP99MS = percentile(tcpConnects, 99)
	}

	c.logger.Info("Summary computed",
		"phase", "continuous",
		"run_id", c.runID,
		"http_count", httpCount,
		"https_count", httpsCount,
		"success_count", successCount,
		"error_count", errorCount,
		"uptime_ratio", summary.UptimeRatio,
		"ttfb_p50_ms", summary.TTFBP50MS,
		"ttfb_p95_ms", summary.TTFBP95MS,
		"jitter_ms", summary.JitterMS,
	)

	return summary
}

// ComputeWSSummary fills in WS metrics on an existing RunSummary
func (c *ResultCollector) ComputeWSSummary(summary *domain.RunSummary, wsSamples []domain.WSSample) {
	if len(wsSamples) == 0 {
		return
	}

	summary.WSSampleCount = len(wsSamples)

	var successCount, errorCount int
	var rtts []float64
	var holdTimes []float64
	var totalDrops, totalSent int

	for _, ws := range wsSamples {
		if ws.Connected {
			successCount++
		} else {
			errorCount++
		}
		if ws.MessageRTTMS > 0 {
			rtts = append(rtts, ws.MessageRTTMS)
		}
		if ws.ConnectionHeldMS > 0 {
			holdTimes = append(holdTimes, ws.ConnectionHeldMS)
		}
		totalDrops += ws.DropCount
		totalSent += ws.MessagesSent
	}

	summary.WSSuccessCount = successCount
	summary.WSErrorCount = errorCount

	if len(rtts) > 0 {
		summary.WSRTTAvgMS = mean(rtts)
		summary.WSRTTP95MS = percentile(rtts, 95)
	}

	if totalSent > 0 {
		summary.WSDropRate = float64(totalDrops) / float64(totalSent)
	}

	if len(holdTimes) > 0 {
		summary.WSAvgHoldMS = mean(holdTimes)
	}

	c.logger.Info("WS summary computed",
		"phase", "continuous",
		"run_id", c.runID,
		"ws_sample_count", len(wsSamples),
		"ws_success_count", successCount,
		"ws_error_count", errorCount,
		"ws_rtt_avg_ms", summary.WSRTTAvgMS,
		"ws_drop_rate", summary.WSDropRate,
	)
}

// --- Math helpers ---

func mean(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range data {
		sum += v
	}
	return sum / float64(len(data))
}

func percentile(data []float64, p float64) float64 {
	if len(data) == 0 {
		return 0
	}
	sorted := make([]float64, len(data))
	copy(sorted, data)
	sort.Float64s(sorted)

	rank := (p / 100.0) * float64(len(sorted)-1)
	lower := int(math.Floor(rank))
	upper := int(math.Ceil(rank))

	if lower == upper || upper >= len(sorted) {
		return sorted[lower]
	}

	frac := rank - float64(lower)
	return sorted[lower]*(1-frac) + sorted[upper]*frac
}

func stddev(data []float64) float64 {
	if len(data) <= 1 {
		return 0
	}
	avg := mean(data)
	sumSquares := 0.0
	for _, v := range data {
		diff := v - avg
		sumSquares += diff * diff
	}
	return math.Sqrt(sumSquares / float64(len(data)))
}

func max(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}
	m := data[0]
	for _, v := range data[1:] {
		if v > m {
			m = v
		}
	}
	return m
}
