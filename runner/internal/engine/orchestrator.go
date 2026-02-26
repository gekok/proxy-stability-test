package engine

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"golang.org/x/sync/errgroup"

	"proxy-stability-test/runner/internal/domain"
	"proxy-stability-test/runner/internal/proxy"
	"proxy-stability-test/runner/internal/reporter"
	"proxy-stability-test/runner/internal/scoring"
)

// Orchestrator manages the lifecycle of testing a single proxy
type Orchestrator struct {
	config      domain.RunConfig
	httpTester  *proxy.HTTPTester
	httpsTester *proxy.HTTPSTester
	collector   *ResultCollector
	reporter    reporter.Reporter
	logger      *slog.Logger
	allSamples  []domain.HTTPSample // accumulated for summary
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

	// Phase 1: IP check (placeholder in Sprint 1)
	o.logger.Info("IP check start (placeholder)",
		"phase", "ip_check",
	)
	o.logger.Info("IP check complete (placeholder)",
		"phase", "ip_check",
	)

	// Setup sample channel and collector
	sampleChan := make(chan domain.HTTPSample, 1000)
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

	// Goroutine 3: WS placeholder
	g.Go(func() error {
		o.logger.Info("WS goroutine started (placeholder)",
			"phase", "continuous",
			"goroutine", "ws",
		)
		<-gCtx.Done()
		o.logger.Info("WS goroutine stopped (placeholder)",
			"phase", "stopping",
			"goroutine", "ws",
		)
		return nil
	})

	// Goroutine 4: Rolling summary
	g.Go(func() error {
		return o.rollingSummary(gCtx)
	})

	// Goroutine 5: Collect samples from channel → batch report
	g.Go(func() error {
		return o.collectAndReport(gCtx, sampleChan)
	})

	o.logger.Info("All 4 goroutines running",
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
	scoring.ComputeScore(&summary)

	o.logger.Info("Final summary computed",
		"phase", "final_summary",
		"final_score", summary.ScoreTotal,
		"total_http_samples", summary.HTTPSampleCount,
		"total_https_samples", summary.HTTPSSampleCount,
		"uptime_ratio", summary.UptimeRatio,
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
			scoring.ComputeScore(&summary)

			o.logger.Info("Rolling summary",
				"phase", "continuous",
				"goroutine", "summary",
				"score_total", summary.ScoreTotal,
				"http_count", summary.HTTPSampleCount,
				"https_count", summary.HTTPSSampleCount,
				"uptime_ratio", summary.UptimeRatio,
			)

			o.reporter.ReportSummary(o.config.RunID, summary)
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
