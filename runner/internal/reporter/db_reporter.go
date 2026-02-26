package reporter

import (
	"log/slog"

	"proxy-stability-test/runner/internal/domain"
)

// DBReporter inserts results directly into PostgreSQL (alternative mode)
type DBReporter struct {
	dbURL  string
	logger *slog.Logger
}

// NewDBReporter creates a new DB reporter
func NewDBReporter(dbURL string, logger *slog.Logger) *DBReporter {
	return &DBReporter{
		dbURL:  dbURL,
		logger: logger.With("module", "reporter.db_reporter"),
	}
}

// ReportHTTPSamples inserts HTTP samples directly into the database
func (r *DBReporter) ReportHTTPSamples(runID string, samples []domain.HTTPSample) error {
	// Sprint 1: placeholder - direct DB insert not yet implemented
	// Will use pgx batch insert in future sprints
	r.logger.Debug("DB insert skipped (using API reporter)",
		"phase", "continuous",
		"run_id", runID,
		"sample_count", len(samples),
	)
	return nil
}

// ReportSummary inserts a run summary directly into the database
func (r *DBReporter) ReportSummary(runID string, summary domain.RunSummary) error {
	r.logger.Debug("DB summary insert skipped (using API reporter)",
		"phase", "continuous",
		"run_id", runID,
	)
	return nil
}

// UpdateStatus updates run status directly in the database
func (r *DBReporter) UpdateStatus(runID string, status string, errorMessage string) error {
	r.logger.Debug("DB status update skipped (using API reporter)",
		"run_id", runID,
		"status", status,
	)
	return nil
}
