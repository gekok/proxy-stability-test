import { WebSocketServer, WebSocket } from 'ws';
import type { Logger } from 'pino';
import { URL } from 'url';

export function setupWsEcho(wss: WebSocketServer, logger: Logger, port: number, protocol: string) {
  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    const startTime = Date.now();
    let messagesCount = 0;
    let pongsReceived = 0;

    // Parse hold duration from query params (default: no hold limit)
    let holdMs = 0;
    try {
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const holdParam = url.searchParams.get('hold');
      if (holdParam) {
        holdMs = parseInt(holdParam, 10);
      }
    } catch {
      // ignore parse errors
    }

    logger.info({
      module: 'ws.wsEcho',
      client_ip: clientIp,
      server_port: port,
      protocol,
      hold_ms: holdMs || null,
    }, 'WS connection opened');

    // Server-initiated ping every 10s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 10000);

    // Hold duration timer: close after hold_ms
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    if (holdMs > 0) {
      holdTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const durationMs = Date.now() - startTime;
          logger.info({
            module: 'ws.wsEcho',
            client_ip: clientIp,
            duration_ms: durationMs,
            messages_count: messagesCount,
            server_port: port,
            protocol,
          }, 'WS hold duration reached');
          ws.close(1000, 'hold duration reached');
        }
      }, holdMs);
    }

    const cleanup = () => {
      clearInterval(pingInterval);
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    ws.on('message', (data) => {
      messagesCount++;
      const message = data.toString();

      logger.debug({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        message_size: message.length,
        messages_count: messagesCount,
        server_port: port,
        protocol,
      }, 'WS message echoed');

      ws.send(message);
    });

    ws.on('pong', () => {
      pongsReceived++;
      logger.debug({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        pongs_received: pongsReceived,
        server_port: port,
        protocol,
      }, 'WS pong received');
    });

    ws.on('close', (code, reason) => {
      cleanup();
      const durationMs = Date.now() - startTime;
      logger.info({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        duration_ms: durationMs,
        messages_count: messagesCount,
        pongs_received: pongsReceived,
        close_code: code,
        close_reason: reason?.toString() || '',
        server_port: port,
        protocol,
      }, 'WS connection closed');
    });

    ws.on('error', (err) => {
      cleanup();
      logger.error({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        error: err.message,
        messages_count: messagesCount,
        server_port: port,
        protocol,
      }, 'WS error');
    });

    // Respond to client pings
    ws.on('ping', (data) => {
      ws.pong(data);
    });
  });
}
