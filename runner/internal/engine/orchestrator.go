package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/errgroup"

	"proxy-stability-test/runner/internal/domain"
	"proxy-stability-test/runner/internal/ipcheck"
	"proxy-stability-test/runner/internal/proxy"
	"proxy-stability-test/runner/internal/reporter"
	"proxy-stability-test/runner/internal/scoring"
)

// Orchestrator manages the lifecycle of testing a single proxy
type Orchestrator struct {
	config       domain.RunConfig
	httpTester   *proxy.HTTPTester
	httpsTester  *proxy.HTTPSTester
	wsTester     *proxy.WSTester
	collector    *ResultCollector
	reporter     reporter.Reporter
	logger       *slog.Logger
	allSamples   []domain.HTTPSample  // accumulated for summary
	allWSSamples []domain.WSSample    // accumulated for WS summary
	ipResult     *domain.IPCheckResult // IP check result
	ipMu         sync.Mutex           // protects ipResult during re-checks
}

// NewOrchestrator creates a new orchestrator for a proxy test run
func NewOrchestrator(cfg domain.RunConfig, rep reporter.Reporter, logger *slog.Logger) *Orchestrator {
	return &Orchestrator{
		config:   cfg,
		reporter: rep,
		logger: logger.With(
			"module", "engine.orchestrator",
			"run_id", cfg.RunID,
			"proxy_label", cfg.Proxy.Label,
		),
	}
}

// Run executes the full test lifecycle
func (o *Orchestrator) Run(ctx context.Context) error {
	o.logger.Info("Orchestrator start",
		"phase", "startup",
		"http_rpm", o.config.HTTPRPM,
		"https_rpm", o.config.HTTPSRPM,
	)

	// Phase 0: Connectivity check
	o.logger.Info("Connectivity check start",
		"phase", "connectivity",
		"proxy_host", o.config.Proxy.Host,
		"proxy_port", o.config.Proxy.Port,
	)

	timeout := time.Duration(o.config.RequestTimeoutMS) * time.Millisecond
	conn, connectMS, err := proxy.DialThroughProxy(ctx, o.config.Proxy, timeout, o.logger)
	if err != nil {
		o.logger.Error("Connectivity check fail",
			"phase", "connectivity",
			"error_detail", err.Error(),
			"connect_ms", connectMS.Milliseconds(),
		)
		o.reporter.UpdateStatus(o.config.RunID, "failed", fmt.Sprintf("connectivity check failed: %s", err.Error()))
		return err
	}
	conn.Close()

	o.logger.Info("Connectivity check pass",
		"phase", "connectivity",
		"connect_ms", connectMS.Milliseconds(),
	)

	// Phase 1: IP check
	o.logger.Info("IP check start",
		"phase", "ip_check",
	)
	ipResult := o.runIPCheck(ctx)
	if ipResult != nil {
		o.ipResult = ipResult
		o.reporter.ReportIPCheck(o.config.RunID, *ipResult)
		o.logger.Info("IP check complete",
			"phase", "ip_check",
			"observed_ip", ipResult.ObservedIP,
			"is_clean", ipResult.IsClean,
			"geo_match", ipResult.GeoMatch,
		)
	} else {
		o.logger.Warn("IP check skipped (could not determine IP)",
			"phase", "ip_check",
		)
	}

	// Setup sample channels and collector
	sampleChan := make(chan domain.HTTPSample, 1000)
	wsSampleChan := make(chan domain.WSSample, 200)
	o.collector = NewResultCollector(o.config.RunID, o.logger)

	// Create testers
	httpBaseURL := o.config.Target.HTTPURL
	httpsBaseURL := o.config.Target.HTTPSURL

	o.httpTester = proxy.NewHTTPTester(
		o.config.Proxy, o.config.RunID, o.config.HTTPRPM,
		o.config.RequestTimeoutMS, httpBaseURL, sampleChan, o.logger,
	)
	o.httpsTester = proxy.NewHTTPSTester(
		o.config.Proxy, o.config.RunID, o.config.HTTPSRPM,
		o.config.RequestTimeoutMS, httpsBaseURL, sampleChan, o.logger,
	)
	o.wsTester = proxy.NewWSTester(
		o.config.Proxy, o.config.RunID, o.config.WSMessagesPerMin,
		o.config.RequestTimeoutMS, httpBaseURL, httpsBaseURL, wsSampleChan, o.logger,
	)

	// Phase 2: Warmup
	o.logger.Info("Warmup start",
		"phase", "warmup",
		"warmup_requests", o.config.WarmupRequests,
	)

	warmupSuccess, warmupFail := 0, 0
	var warmupTotalMS float64
	for i := 0; i < o.config.WarmupRequests; i++ {
		sample := o.httpTester.DoSingleRequest(ctx, "GET", "/echo", nil, i)
		sample.IsWarmup = true
		o.allSamples = append(o.allSamples, sample)

		if sample.ErrorType == "" {
			warmupSuccess++
			warmupTotalMS += sample.TotalMS
			o.logger.Debug("Warmup request success",
				"phase", "warmup",
				"seq", i,
				"total_ms", sample.TotalMS,
			)
		} else {
			warmupFail++
			o.logger.Debug("Warmup request fail",
				"phase", "warmup",
				"seq", i,
				"error_type", sample.ErrorType,
			)
		}
	}

	avgWarmupMS := 0.0
	if warmupSuccess > 0 {
		avgWarmupMS = warmupTotalMS / float64(warmupSuccess)
	}

	o.logger.Info("Warmup complete",
		"phase", "warmup",
		"success_count", warmupSuccess,
		"fail_count", warmupFail,
		"avg_ms", avgWarmupMS,
	)

	// Phase 3: Start goroutines
	o.logger.Info("Continuous phase start",
		"phase", "continuous",
	)

	g, gCtx := errgroup.WithContext(ctx)

	// Goroutine 1: HTTP tester
	g.Go(func() error {
		return o.httpTester.Run(gCtx)
	})

	// Goroutine 2: HTTPS tester
	g.Go(func() error {
		return o.httpsTester.Run(gCtx)
	})

	// Goroutine 3: WS tester
	g.Go(func() error {
		return o.wsTester.Run(gCtx)
	})

	// Goroutine 5b: Collect WS samples from channel → batch report
	g.Go(func() error {
		return o.collectAndReportWS(gCtx, wsSampleChan)
	})

	// Goroutine 4: Rolling summary
	g.Go(func() error {
		return o.rollingSummary(gCtx)
	})

	// Goroutine 6: Burst test (every 5 minutes)
	g.Go(func() error {
		return o.runBurstLoop(gCtx, sampleChan)
	})

	// Goroutine 8: IP re-check (Sprint 4)
	if o.ipResult != nil && o.config.ScoringCfg.IPCheckIntervalSec > 0 {
		g.Go(func() error {
			return o.ipReCheckLoop(gCtx)
		})
	}

	// Goroutine 7: Collect samples from channel → batch report
	g.Go(func() error {
		return o.collectAndReport(gCtx, sampleChan)
	})

	o.logger.Info("All goroutines running",
		"phase", "continuous",
	)

	// Wait for all goroutines to finish
	err = g.Wait()

	// Phase 4: Stopping
	o.logger.Info("All goroutines stopped",
		"phase", "stopping",
	)

	// Phase 5: Final summary
	o.logger.Info("Final summary",
		"phase", "final_summary",
	)

	summary := o.collector.ComputeSummary(o.allSamples)
	o.collector.ComputeWSSummary(&summary, o.allWSSamples)
	o.ipMu.Lock()
	if o.ipResult != nil {
		summary.IPClean = &o.ipResult.IsClean
		summary.IPGeoMatch = &o.ipResult.GeoMatch
		summary.IPStable = &o.ipResult.IPStable
		// Sprint 4: gradient IP clean score
		if o.ipResult.BlacklistQueried > 0 {
			score := 1.0 - float64(o.ipResult.BlacklistListed)/float64(o.ipResult.BlacklistQueried)
			summary.IPCleanScore = score
		} else {
			summary.IPCleanScore = 1.0
		}
	}
	o.ipMu.Unlock()
	scoring.ComputeScore(&summary, o.config.ScoringCfg)

	o.logger.Info("Final summary computed",
		"phase", "final_summary",
		"final_score", summary.ScoreTotal,
		"total_http_samples", summary.HTTPSampleCount,
		"total_https_samples", summary.HTTPSSampleCount,
		"ws_sample_count", summary.WSSampleCount,
		"uptime_ratio", summary.UptimeRatio,
		"score_ws", summary.ScoreWS,
		"score_security", summary.ScoreSecurity,
	)

	o.reporter.ReportSummary(o.config.RunID, summary)
	o.reporter.UpdateStatus(o.config.RunID, "completed", "")

	o.logger.Info("Orchestrator complete",
		"phase", "final_summary",
	)

	return err
}

func (o *Orchestrator) rollingSummary(ctx context.Context) error {
	interval := time.Duration(o.config.SummaryIntervalSec) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			summary := o.collector.ComputeSummary(o.allSamples)
			o.collector.ComputeWSSummary(&summary, o.allWSSamples)
			o.ipMu.Lock()
			if o.ipResult != nil {
				summary.IPClean = &o.ipResult.IsClean
				summary.IPGeoMatch = &o.ipResult.GeoMatch
				summary.IPStable = &o.ipResult.IPStable
				if o.ipResult.BlacklistQueried > 0 {
					summary.IPCleanScore = 1.0 - float64(o.ipResult.BlacklistListed)/float64(o.ipResult.BlacklistQueried)
				} else {
					summary.IPCleanScore = 1.0
				}
			}
			o.ipMu.Unlock()
			scoring.ComputeScore(&summary, o.config.ScoringCfg)

			o.logger.Info("Rolling summary",
				"phase", "continuous",
				"goroutine", "summary",
				"score_total", summary.ScoreTotal,
				"http_count", summary.HTTPSampleCount,
				"https_count", summary.HTTPSSampleCount,
				"ws_count", summary.WSSampleCount,
				"uptime_ratio", summary.UptimeRatio,
			)

			o.reporter.ReportSummary(o.config.RunID, summary)
		}
	}
}

// runIPCheck performs the Phase 1 IP verification
func (o *Orchestrator) runIPCheck(ctx context.Context) *domain.IPCheckResult {
	// Step 1: Get observed IP via proxy
	observedIP := o.getIPViaProxy(ctx)
	if observedIP == "" {
		return nil
	}

	result := &domain.IPCheckResult{
		RunID:           o.config.RunID,
		ProxyID:         "", // filled by API
		ObservedIP:      observedIP,
		ExpectedCountry: o.config.Proxy.ExpectedCountry,
	}

	// Step 2: Blacklist check
	queried, listed, sources, err := ipcheck.CheckBlacklist(o.logger, observedIP)
	if err != nil {
		o.logger.Warn("Blacklist check error",
			"phase", "ip_check",
			"error_detail", err.Error(),
		)
	}
	result.BlacklistChecked = true
	result.BlacklistQueried = queried
	result.BlacklistListed = listed
	result.BlacklistSources = sources
	result.IsClean = listed == 0

	// Step 3: GeoIP verification
	_, countryCode, region, city, err := ipcheck.CheckGeoIP(o.logger, observedIP)
	if err != nil {
		o.logger.Warn("GeoIP check error",
			"phase", "ip_check",
			"error_detail", err.Error(),
		)
	} else {
		result.ActualCountry = countryCode
		result.ActualRegion = region
		result.ActualCity = city
		result.GeoMatch = ipcheck.CheckGeoMatch(o.logger, o.config.Proxy.ExpectedCountry, countryCode, observedIP)
	}

	result.IPStable = true
	result.IPChanges = 0

	return result
}

// getIPViaProxy sends GET /ip through the proxy to determine the observed IP
func (o *Orchestrator) getIPViaProxy(ctx context.Context) string {
	proxyURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("%s:%d", o.config.Proxy.Host, o.config.Proxy.Port),
	}
	if o.config.Proxy.AuthUser != "" {
		proxyURL.User = url.UserPassword(o.config.Proxy.AuthUser, o.config.Proxy.AuthPass)
	}

	client := &http.Client{
		Timeout: time.Duration(o.config.RequestTimeoutMS) * time.Millisecond,
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
		},
	}

	targetURL := o.config.Target.HTTPURL + "/ip"
	req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		o.logger.Error("IP check request build fail",
			"phase", "ip_check",
			"error_detail", err.Error(),
		)
		return ""
	}

	resp, err := client.Do(req)
	if err != nil {
		o.logger.Error("IP check request fail",
			"phase", "ip_check",
			"error_detail", err.Error(),
		)
		return ""
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		o.logger.Warn("IP check got non-200 response",
			"phase", "ip_check",
			"status_code", resp.StatusCode,
		)
		return ""
	}

	body, _ := io.ReadAll(resp.Body)
	var ipResp struct {
		IP string `json:"ip"`
	}
	if err := json.Unmarshal(body, &ipResp); err != nil {
		// Try raw text
		return strings.TrimSpace(string(body))
	}
	return ipResp.IP
}

// ipReCheckLoop periodically re-checks the proxy IP for stability (Sprint 4)
func (o *Orchestrator) ipReCheckLoop(ctx context.Context) error {
	interval := time.Duration(o.config.ScoringCfg.IPCheckIntervalSec) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			newIP := o.getIPViaProxy(ctx)
			if newIP == "" {
				o.logger.Warn("IP re-check failed",
					"phase", "continuous",
					"goroutine", "ip_recheck",
				)
				continue
			}
			o.ipMu.Lock()
			if o.ipResult != nil && newIP != o.ipResult.ObservedIP {
				o.logger.Warn("IP changed",
					"module", "engine.orchestrator",
					"phase", "continuous",
					"old_ip", o.ipResult.ObservedIP,
					"new_ip", newIP,
					"proxy_id", o.config.Proxy.Label,
					"run_id", o.config.RunID,
				)
				o.ipResult.IPStable = false
				o.ipResult.IPChanges++
				o.ipResult.ObservedIP = newIP
			}
			o.ipMu.Unlock()
		}
	}
}

// runBurstLoop runs burst tests periodically
func (o *Orchestrator) runBurstLoop(ctx context.Context, sampleChan chan<- domain.HTTPSample) error {
	intervalSec := 300 // default 5 minutes
	concurrency := 100
	if o.config.Burst != nil {
		if o.config.Burst.IntervalSec > 0 {
			intervalSec = o.config.Burst.IntervalSec
		}
		if o.config.Burst.Concurrency > 0 {
			concurrency = o.config.Burst.Concurrency
		}
	}

	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			o.runBurst(ctx, concurrency, sampleChan)
		}
	}
}

// runBurst spawns concurrent goroutines hitting GET /echo
func (o *Orchestrator) runBurst(ctx context.Context, count int, sampleChan chan<- domain.HTTPSample) {
	o.logger.Info("Concurrency burst start",
		"phase", "continuous",
		"goroutine", "burst",
		"concurrent_count", count,
	)

	targetURL := o.config.Target.HTTPURL + "/echo"

	proxyURL := &url.URL{
		Scheme: "http",
		Host:   fmt.Sprintf("%s:%d", o.config.Proxy.Host, o.config.Proxy.Port),
	}
	if o.config.Proxy.AuthUser != "" {
		proxyURL.User = url.UserPassword(o.config.Proxy.AuthUser, o.config.Proxy.AuthPass)
	}

	var successCount, failCount int64
	var totalMS int64
	var wg sync.WaitGroup

	burstStart := time.Now()

	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			client := &http.Client{
				Timeout: 10 * time.Second,
				Transport: &http.Transport{
					Proxy: http.ProxyURL(proxyURL),
				},
			}

			reqStart := time.Now()
			req, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
			if err != nil {
				atomic.AddInt64(&failCount, 1)
				return
			}

			resp, err := client.Do(req)
			elapsed := time.Since(reqStart).Milliseconds()
			atomic.AddInt64(&totalMS, elapsed)

			if err != nil {
				atomic.AddInt64(&failCount, 1)
				return
			}
			resp.Body.Close()

			if resp.StatusCode < 400 {
				atomic.AddInt64(&successCount, 1)
			} else {
				atomic.AddInt64(&failCount, 1)
			}
		}(i)
	}

	wg.Wait()
	burstDuration := time.Since(burstStart)

	s := atomic.LoadInt64(&successCount)
	f := atomic.LoadInt64(&failCount)
	total := s + f
	avgMS := float64(0)
	if total > 0 {
		avgMS = float64(atomic.LoadInt64(&totalMS)) / float64(total)
	}

	o.logger.Info("Concurrency burst complete",
		"phase", "continuous",
		"goroutine", "burst",
		"concurrent_count", count,
		"success_count", s,
		"fail_count", f,
		"avg_ms", avgMS,
		"duration_ms", burstDuration.Milliseconds(),
	)
}

// collectAndReportWS collects WS samples from channel and reports them in batches
func (o *Orchestrator) collectAndReportWS(ctx context.Context, wsSampleChan <-chan domain.WSSample) error {
	batch := make([]domain.WSSample, 0, 20)
	batchTimeout := time.NewTicker(5 * time.Second)
	defer batchTimeout.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}

		o.allWSSamples = append(o.allWSSamples, batch...)

		o.logger.Debug("WS batch assembled",
			"phase", "continuous",
			"batch_size", len(batch),
		)

		o.reporter.ReportWSSamples(o.config.RunID, batch)
		batch = make([]domain.WSSample, 0, 20)
	}

	for {
		select {
		case <-ctx.Done():
			draining := true
			for draining {
				select {
				case sample := <-wsSampleChan:
					batch = append(batch, sample)
				default:
					draining = false
				}
			}
			flush()
			return nil
		case sample := <-wsSampleChan:
			batch = append(batch, sample)
			if len(batch) >= 20 {
				flush()
			}
		case <-batchTimeout.C:
			flush()
		}
	}
}

func (o *Orchestrator) collectAndReport(ctx context.Context, sampleChan <-chan domain.HTTPSample) error {
	batch := make([]domain.HTTPSample, 0, 50)
	batchTimeout := time.NewTicker(5 * time.Second)
	defer batchTimeout.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}

		o.allSamples = append(o.allSamples, batch...)

		httpCount, httpsCount := 0, 0
		for _, s := range batch {
			if s.IsHTTPS {
				httpsCount++
			} else {
				httpCount++
			}
		}

		o.logger.Debug("Batch assembled",
			"phase", "continuous",
			"batch_size", len(batch),
			"http_count", httpCount,
			"https_count", httpsCount,
		)

		o.reporter.ReportHTTPSamples(o.config.RunID, batch)
		batch = make([]domain.HTTPSample, 0, 50)
	}

	for {
		select {
		case <-ctx.Done():
			// Drain remaining samples
			draining := true
			for draining {
				select {
				case sample := <-sampleChan:
					batch = append(batch, sample)
				default:
					draining = false
				}
			}
			flush()
			return nil
		case sample := <-sampleChan:
			batch = append(batch, sample)
			if len(batch) >= 50 {
				flush()
			}
		case <-batchTimeout.C:
			flush()
		}
	}
}
