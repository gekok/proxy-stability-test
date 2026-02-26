import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'target', level: process.env.LOG_LEVEL || 'info' });
export const largeRouter = Router();

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_SIZE = 1024;

largeRouter.get('/', (req: Request, res: Response) => {
  const serverPort = req.socket.localPort || 3001;
  const protocol = req.secure ? 'https' : 'http';
  const sizeParam = parseInt(req.query.size as string, 10);
  const size = isNaN(sizeParam) ? DEFAULT_SIZE : Math.min(Math.max(sizeParam, 1), MAX_SIZE);

  const start = Date.now();

  logger.info({
    module: 'routes.large',
    size_bytes: size,
    server_port: serverPort,
    protocol,
  }, 'Large payload generating');

  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Length', String(size));

  // Stream in chunks to avoid memory issues with large payloads
  const chunkSize = 64 * 1024; // 64KB chunks
  let remaining = size;

  const writeChunk = () => {
    while (remaining > 0) {
      const toWrite = Math.min(chunkSize, remaining);
      const chunk = crypto.randomBytes(toWrite);
      remaining -= toWrite;

      if (!res.write(chunk)) {
        res.once('drain', writeChunk);
        return;
      }
    }
    res.end();
    const durationMs = Date.now() - start;
    logger.info({
      module: 'routes.large',
      size_bytes: size,
      duration_ms: durationMs,
      server_port: serverPort,
      protocol,
    }, 'Large payload generated');
  };

  writeChunk();
});
