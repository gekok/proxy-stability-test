package reporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"proxy-stability-test/runner/internal/domain"
)

// Reporter interface for reporting test results
type Reporter interface {
	ReportHTTPSamples(runID string, samples []domain.HTTPSample) error
	ReportWSSamples(runID string, samples []domain.WSSample) error
	ReportIPCheck(runID string, result domain.IPCheckResult) error
	ReportSummary(runID string, summary domain.RunSummary) error
	UpdateStatus(runID string, status string, errorMessage string) error
}

// APIReporter sends results to the Controller API
type APIReporter struct {
	apiURL    string
	batchSize int
	client    *http.Client
	logger    *slog.Logger
	maxRetry  int
}

// NewAPIReporter creates a new API reporter
func NewAPIReporter(apiURL string, logger *slog.Logger) *APIReporter {
	return &APIReporter{
		apiURL:    apiURL,
		batchSize: 50,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		logger:   logger.With("module", "reporter.api_reporter"),
		maxRetry: 3,
	}
}

// ReportHTTPSamples sends HTTP samples to the API in batches
func (r *APIReporter) ReportHTTPSamples(runID string, samples []domain.HTTPSample) error {
	if len(samples) == 0 {
		return nil
	}

	// Split into batches
	for i := 0; i < len(samples); i += r.batchSize {
		end := i + r.batchSize
		if end > len(samples) {
			end = len(samples)
		}
		batch := samples[i:end]

		url := fmt.Sprintf("%s/runs/%s/http-samples/batch", r.apiURL, runID)
		payload := map[string]interface{}{
			"samples": batch,
		}

		r.logger.Debug("Batch POST start",
			"phase", "continuous",
			"run_id", runID,
			"url", url,
			"batch_size", len(batch),
		)

		err := r.postWithRetry(url, payload)
		if err != nil {
			r.logger.Error("Batch POST fail",
				"phase", "continuous",
				"run_id", runID,
				"error_detail", err.Error(),
				"batch_size", len(batch),
			)
			return err
		}

		r.logger.Debug("Batch POST success",
			"phase", "continuous",
			"run_id", runID,
			"batch_size", len(batch),
		)
	}

	return nil
}

// ReportWSSamples sends WS samples to the API in batches
func (r *APIReporter) ReportWSSamples(runID string, samples []domain.WSSample) error {
	if len(samples) == 0 {
		return nil
	}

	for i := 0; i < len(samples); i += r.batchSize {
		end := i + r.batchSize
		if end > len(samples) {
			end = len(samples)
		}
		batch := samples[i:end]

		url := fmt.Sprintf("%s/runs/%s/ws-samples/batch", r.apiURL, runID)
		payload := map[string]interface{}{
			"samples": batch,
		}

		r.logger.Debug("WS batch POST start",
			"phase", "continuous",
			"run_id", runID,
			"batch_size", len(batch),
		)

		err := r.postWithRetry(url, payload)
		if err != nil {
			r.logger.Error("WS batch POST fail",
				"phase", "continuous",
				"run_id", runID,
				"error_detail", err.Error(),
			)
			return err
		}
	}

	return nil
}

// ReportIPCheck sends an IP check result to the API
func (r *APIReporter) ReportIPCheck(runID string, result domain.IPCheckResult) error {
	url := fmt.Sprintf("%s/runs/%s/ip-checks", r.apiURL, runID)

	r.logger.Debug("IP check POST start",
		"phase", "ip_check",
		"run_id", runID,
		"observed_ip", result.ObservedIP,
	)

	err := r.postWithRetry(url, result)
	if err != nil {
		r.logger.Error("IP check POST fail",
			"phase", "ip_check",
			"run_id", runID,
			"error_detail", err.Error(),
		)
	}
	return err
}

// ReportSummary sends a run summary to the API
func (r *APIReporter) ReportSummary(runID string, summary domain.RunSummary) error {
	url := fmt.Sprintf("%s/runs/%s/summary", r.apiURL, runID)
	return r.postWithRetry(url, summary)
}

// UpdateStatus updates the run status via the API
func (r *APIReporter) UpdateStatus(runID string, status string, errorMessage string) error {
	url := fmt.Sprintf("%s/runs/%s/status", r.apiURL, runID)
	payload := map[string]interface{}{
		"status": status,
	}
	if errorMessage != "" {
		payload["error_message"] = errorMessage
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("PATCH", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.client.Do(req)
	if err != nil {
		r.logger.Error("Status update fail",
			"run_id", runID,
			"status", status,
			"error_detail", err.Error(),
		)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		r.logger.Error("Status update fail",
			"run_id", runID,
			"status", status,
			"http_status", resp.StatusCode,
		)
	}

	return nil
}

func (r *APIReporter) postWithRetry(url string, payload interface{}) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < r.maxRetry; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*attempt) * time.Second
			r.logger.Warn("Retry scheduled",
				"phase", "continuous",
				"url", url,
				"attempt", attempt+1,
				"backoff_ms", backoff.Milliseconds(),
			)
			time.Sleep(backoff)
		}

		resp, err := r.client.Post(url, "application/json", bytes.NewReader(body))
		if err != nil {
			lastErr = err
			continue
		}
		resp.Body.Close()

		if resp.StatusCode < 400 {
			return nil
		}

		lastErr = fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	r.logger.Error("All retries exhausted",
		"phase", "continuous",
		"url", url,
		"max_retry", r.maxRetry,
		"last_error", lastErr.Error(),
	)

	return lastErr
}
