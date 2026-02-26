package engine

import (
	"context"
	"log/slog"
	"sync"

	"proxy-stability-test/runner/internal/domain"
	"proxy-stability-test/runner/internal/reporter"
)

// Scheduler manages parallel proxy test runs
type Scheduler struct {
	maxParallel int
	logger      *slog.Logger
}

// NewScheduler creates a new scheduler
func NewScheduler(maxParallel int, logger *slog.Logger) *Scheduler {
	return &Scheduler{
		maxParallel: maxParallel,
		logger:      logger.With("module", "engine.scheduler"),
	}
}

// RunSingle runs a single proxy test (Sprint 1)
func (s *Scheduler) RunSingle(ctx context.Context, cfg domain.RunConfig, apiURL, dbURL string) {
	s.logger.Info("Scheduler start",
		"proxy_count", 1,
		"proxy_label", cfg.Proxy.Label,
	)

	rep := reporter.NewAPIReporter(apiURL, s.logger)

	s.logger.Info("Proxy goroutine start",
		"run_id", cfg.RunID,
		"proxy_label", cfg.Proxy.Label,
	)

	orch := NewOrchestrator(cfg, rep, s.logger)
	if err := orch.Run(ctx); err != nil {
		s.logger.Error("Proxy goroutine error",
			"run_id", cfg.RunID,
			"proxy_label", cfg.Proxy.Label,
			"error_detail", err.Error(),
		)
	}

	s.logger.Info("Proxy goroutine done",
		"run_id", cfg.RunID,
		"proxy_label", cfg.Proxy.Label,
	)

	s.logger.Info("All proxies done",
		"proxy_count", 1,
	)
}

// RunAll runs multiple proxy tests in parallel (Sprint 3+)
func (s *Scheduler) RunAll(ctx context.Context, runs []domain.RunConfig, apiURL, dbURL string) {
	s.logger.Info("Scheduler start",
		"proxy_count", len(runs),
	)

	sem := make(chan struct{}, s.maxParallel)
	var wg sync.WaitGroup

	for _, run := range runs {
		wg.Add(1)
		sem <- struct{}{}

		go func(r domain.RunConfig) {
			defer wg.Done()
			defer func() {
				<-sem
				if rec := recover(); rec != nil {
					s.logger.Error("Panic recovered",
						"run_id", r.RunID,
						"proxy_label", r.Proxy.Label,
						"panic", rec,
					)
				}
			}()

			s.logger.Info("Proxy goroutine start",
				"run_id", r.RunID,
				"proxy_label", r.Proxy.Label,
			)

			rep := reporter.NewAPIReporter(apiURL, s.logger)
			orch := NewOrchestrator(r, rep, s.logger)
			if err := orch.Run(ctx); err != nil {
				s.logger.Error("Proxy goroutine error",
					"run_id", r.RunID,
					"error_detail", err.Error(),
				)
			}

			s.logger.Info("Proxy goroutine done",
				"run_id", r.RunID,
				"proxy_label", r.Proxy.Label,
			)
		}(run)
	}

	wg.Wait()

	s.logger.Info("All proxies done",
		"proxy_count", len(runs),
	)
}
