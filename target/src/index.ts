import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { WebSocketServer } from 'ws';
import { echoRouter } from './routes/echo';
import { ipRouter } from './routes/ip';
import { largeRouter } from './routes/large';
import { slowRouter } from './routes/slow';
import { healthRouter } from './routes/health';
import { setupWsEcho } from './ws/wsEcho';

const logger = pino({ name: 'target', level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount routes
app.use('/health', healthRouter);
app.use('/echo', echoRouter);
app.use('/ip', ipRouter);
app.use('/large', largeRouter);
app.use('/slow', slowRouter);

logger.info({
  module: 'index',
  routes: ['/health', '/echo', '/ip', '/large', '/slow', '/ws-echo'],
}, 'All routes mounted');

// HTTP server (:3001)
const httpServer = app.listen(3001, () => {
  logger.info({
    module: 'index',
    protocol: 'http',
    port: 3001,
  }, 'HTTP server started');
});

// HTTPS server (:3443)
const certDir = path.resolve(__dirname, '../certs');
let httpsServer: https.Server;

try {
  const key = fs.readFileSync(path.join(certDir, 'server.key'));
  const cert = fs.readFileSync(path.join(certDir, 'server.crt'));

  logger.info({
    module: 'index',
    cert_path: path.join(certDir, 'server.crt'),
    key_path: path.join(certDir, 'server.key'),
  }, 'TLS cert loaded');

  httpsServer = https.createServer({ key, cert }, app);
  httpsServer.listen(3443, () => {
    logger.info({
      module: 'index',
      protocol: 'https',
      port: 3443,
      cert_path: path.join(certDir, 'server.crt'),
      key_path: path.join(certDir, 'server.key'),
    }, 'HTTPS server started');
  });

  // WebSocket on HTTPS
  const wssServer = new WebSocketServer({ server: httpsServer, path: '/ws-echo' });
  setupWsEcho(wssServer, logger, 3443, 'https');
} catch (err) {
  logger.warn({
    module: 'index',
    error: (err as Error).message,
  }, 'HTTPS server not started (cert not found). HTTP-only mode.');
}

// WebSocket on HTTP
const wsServer = new WebSocketServer({ server: httpServer, path: '/ws-echo' });
setupWsEcho(wsServer, logger, 3001, 'http');

// Graceful shutdown
const shutdown = () => {
  logger.info({ module: 'index' }, 'Shutting down...');
  httpServer.close();
  if (httpsServer) httpsServer.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
