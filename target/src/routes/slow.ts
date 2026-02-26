import { Router, Request, Response } from 'express';
import pino from 'pino';

const logger = pino({ name: 'target', level: process.env.LOG_LEVEL || 'info' });
export const slowRouter = Router();

const MAX_DELAY = 30000;
const DEFAULT_DELAY = 1000;

slowRouter.get('/', (req: Request, res: Response) => {
  const serverPort = req.socket.localPort || 3001;
  const protocol = req.secure ? 'https' : 'http';
  const delayParam = parseInt(req.query.delay as string, 10);
  const delay = isNaN(delayParam) ? DEFAULT_DELAY : Math.min(Math.max(delayParam, 0), MAX_DELAY);

  logger.debug({
    module: 'routes.slow',
    delay_ms: delay,
    server_port: serverPort,
    protocol,
  }, 'Slow endpoint delay');

  setTimeout(() => {
    res.json({
      delayed_ms: delay,
      timestamp: new Date().toISOString(),
    });
  }, delay);
});
