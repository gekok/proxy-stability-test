package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"

	"proxy-stability-test/runner/internal/config"
	"proxy-stability-test/runner/internal/domain"
	"proxy-stability-test/runner/internal/engine"
)

// Handler manages HTTP endpoints for the Runner service
type Handler struct {
	logger     *slog.Logger
	apiURL     string
	dbURL      string
	scheduler  *engine.Scheduler
	mu         sync.Mutex
	cancelFns  map[string]context.CancelFunc
}

// NewHandler creates a new Handler
func NewHandler(logger *slog.Logger, apiURL, dbURL string) *Handler {
	return &Handler{
		logger:    logger.With("module", "server.handler"),
		apiURL:    apiURL,
		dbURL:     dbURL,
		scheduler: engine.NewScheduler(10, logger),
		cancelFns: make(map[string]context.CancelFunc),
	}
}

// RegisterRoutes registers HTTP endpoints
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", h.handleHealth)
	mux.HandleFunc("POST /trigger", h.handleTrigger)
	mux.HandleFunc("POST /stop", h.handleStop)
}

func (h *Handler) handleHealth(w http.ResponseWriter, _ *http.Request) {
	h.mu.Lock()
	activeRuns := len(h.cancelFns)
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "ok",
		"active_runs": activeRuns,
	})
}

func (h *Handler) handleTrigger(w http.ResponseWriter, r *http.Request) {
	var payload domain.TriggerPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.logger.Error("Invalid trigger request",
			"error_detail", err.Error(),
		)
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	if len(payload.Runs) == 0 {
		http.Error(w, `{"error":"no runs provided"}`, http.StatusBadRequest)
		return
	}

	h.logger.Info("Trigger received",
		"run_count", len(payload.Runs),
		"run_ids", runIDs(payload.Runs),
	)

	// Build configs and register individual cancel functions for isolation
	accepted := 0
	for _, tr := range payload.Runs {
		cfg := config.FromTrigger(tr)

		ctx, cancel := context.WithCancel(context.Background())

		h.mu.Lock()
		h.cancelFns[cfg.RunID] = cancel
		h.mu.Unlock()

		accepted++

		go func(c domain.RunConfig, cancelFn context.CancelFunc) {
			defer func() {
				h.mu.Lock()
				delete(h.cancelFns, c.RunID)
				h.mu.Unlock()
				cancelFn()
			}()

			h.scheduler.RunSingle(ctx, c, h.apiURL, h.dbURL)
		}(cfg, cancel)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"accepted": accepted,
	})
}

func (h *Handler) handleStop(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RunID string `json:"run_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RunID == "" {
		http.Error(w, `{"error":"run_id is required"}`, http.StatusBadRequest)
		return
	}

	h.mu.Lock()
	cancel, exists := h.cancelFns[body.RunID]
	h.mu.Unlock()

	if !exists {
		h.logger.Warn("Stop signal received for unknown run",
			"run_id", body.RunID,
		)
		http.Error(w, `{"error":"run not found"}`, http.StatusNotFound)
		return
	}

	h.logger.Info("Stop signal received",
		"run_id", body.RunID,
	)

	cancel()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "stopping",
	})
}

func runIDs(runs []domain.TriggerRun) []string {
	ids := make([]string, len(runs))
	for i, r := range runs {
		ids[i] = r.RunID
	}
	return ids
}
