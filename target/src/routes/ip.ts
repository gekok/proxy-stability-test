import { Router, Request, Response } from 'express';
import pino from 'pino';

const logger = pino({ name: 'target', level: process.env.LOG_LEVEL || 'info' });
export const ipRouter = Router();

const handleIp = (req: Request, res: Response) => {
  const serverPort = req.socket.localPort || 3001;
  const protocol = req.secure ? 'https' : 'http';
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const clientIp = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null)
    || (typeof realIp === 'string' ? realIp : null)
    || req.socket.remoteAddress
    || 'unknown';

  logger.debug({
    module: 'routes.ip',
    client_ip: clientIp,
    server_port: serverPort,
    protocol,
  }, 'IP request received');

  if (req.method === 'HEAD') {
    res.set('Content-Type', 'application/json');
    return res.status(200).end();
  }

  res.json({
    ip: clientIp,
    headers: {
      'x-forwarded-for': forwarded || null,
      'x-real-ip': realIp || null,
    },
    timestamp: new Date().toISOString(),
  });
};

ipRouter.get('/', handleIp);
ipRouter.head('/', handleIp);
