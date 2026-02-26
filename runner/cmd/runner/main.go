package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"proxy-stability-test/runner/internal/server"
)

func main() {
	// Setup structured JSON logger
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLogLevel(os.Getenv("LOG_LEVEL")),
	})
	logger := slog.New(handler).With("service", "runner")
	slog.SetDefault(logger)

	port := os.Getenv("RUNNER_PORT")
	if port == "" {
		port = "9090"
	}

	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://api:8000/api/v1"
	}

	dbURL := os.Getenv("DATABASE_URL")

	logger.Info("Runner process starting",
		"module", "server.handler",
		"phase", "startup",
		"port", port,
		"api_url", apiURL,
		"go_version", runtime.Version(),
	)

	// Create handler and register routes
	h := server.NewHandler(logger, apiURL, dbURL)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Start server in goroutine
	go func() {
		logger.Info("Runner server started",
			"module", "server.handler",
			"phase", "startup",
			"port", port,
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Runner server failed",
				"module", "server.handler",
				"error_detail", err.Error(),
			)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)
	sig := <-sigChan

	logger.Info("Runner server shutdown",
		"module", "server.handler",
		"signal", sig.String(),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Shutdown error",
			"module", "server.handler",
			"error_detail", err.Error(),
		)
	}
}

func parseLogLevel(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
