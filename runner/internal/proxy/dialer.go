package proxy

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"proxy-stability-test/runner/internal/domain"
)

// DialThroughProxy creates a TCP connection to the proxy server
func DialThroughProxy(ctx context.Context, proxy domain.ProxyConfig, timeout time.Duration, logger *slog.Logger) (net.Conn, time.Duration, error) {
	addr := fmt.Sprintf("%s:%d", proxy.Host, proxy.Port)

	logger.Debug("TCP connect start",
		"proxy_host", proxy.Host,
		"proxy_port", proxy.Port,
	)

	start := time.Now()
	dialer := net.Dialer{Timeout: timeout}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	connectMS := time.Since(start)

	if err != nil {
		logger.Error("TCP connect fail",
			"proxy_label", proxy.Label,
			"error_type", "connection_refused",
			"error_detail", err.Error(),
			"connect_ms", connectMS.Milliseconds(),
		)
		return nil, connectMS, fmt.Errorf("tcp_connect_failed: %w", err)
	}

	logger.Info("TCP connect success",
		"proxy_label", proxy.Label,
		"connect_ms", connectMS.Milliseconds(),
	)
	return conn, connectMS, nil
}

// ConnectTunnel sends a CONNECT request through the proxy for HTTPS/WSS tunneling
func ConnectTunnel(conn net.Conn, targetHost string, targetPort int, proxy domain.ProxyConfig, logger *slog.Logger) error {
	target := fmt.Sprintf("%s:%d", targetHost, targetPort)
	connectReq := fmt.Sprintf("CONNECT %s HTTP/1.1\r\nHost: %s\r\n", target, target)

	if proxy.AuthUser != "" {
		auth := base64.StdEncoding.EncodeToString([]byte(proxy.AuthUser + ":" + proxy.AuthPass))
		connectReq += fmt.Sprintf("Proxy-Authorization: Basic %s\r\n", auth)
	}

	connectReq += "\r\n"

	_, err := conn.Write([]byte(connectReq))
	if err != nil {
		return fmt.Errorf("connect_tunnel_failed: write: %w", err)
	}

	reader := bufio.NewReader(conn)
	resp, err := http.ReadResponse(reader, nil)
	if err != nil {
		return fmt.Errorf("connect_tunnel_failed: read: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		errType := classifyConnectError(resp.StatusCode)
		logger.Error("CONNECT tunnel fail",
			"target", target,
			"status_code", resp.StatusCode,
			"error_type", errType,
		)
		return fmt.Errorf("%s: status %d", errType, resp.StatusCode)
	}

	logger.Debug("CONNECT tunnel success",
		"target", target,
	)
	return nil
}

func classifyConnectError(statusCode int) string {
	switch {
	case statusCode == 407:
		return "proxy_auth_failed"
	case statusCode == 403:
		return "proxy_rejected"
	case statusCode >= 500:
		return "proxy_error"
	default:
		return "connect_tunnel_failed"
	}
}
