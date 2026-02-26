import { WebSocketServer, WebSocket } from 'ws';
import type { Logger } from 'pino';

export function setupWsEcho(wss: WebSocketServer, logger: Logger, port: number, protocol: string) {
  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    const startTime = Date.now();
    let messagesCount = 0;

    logger.info({
      module: 'ws.wsEcho',
      client_ip: clientIp,
      server_port: port,
      protocol,
    }, 'WS connection opened');

    ws.on('message', (data) => {
      messagesCount++;
      const message = data.toString();

      logger.debug({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        message_size: message.length,
        server_port: port,
        protocol,
      }, 'WS message echoed');

      // Echo the message back
      ws.send(message);
    });

    ws.on('close', () => {
      const durationMs = Date.now() - startTime;
      logger.info({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        duration_ms: durationMs,
        messages_count: messagesCount,
        server_port: port,
        protocol,
      }, 'WS connection closed');
    });

    ws.on('error', (err) => {
      logger.error({
        module: 'ws.wsEcho',
        client_ip: clientIp,
        error: err.message,
        server_port: port,
        protocol,
      }, 'WS error');
    });

    // Respond to pings
    ws.on('ping', (data) => {
      ws.pong(data);
    });
  });
}
