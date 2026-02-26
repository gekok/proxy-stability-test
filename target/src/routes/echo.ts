import { Router, Request, Response } from 'express';
import pino from 'pino';

const logger = pino({ name: 'target', level: process.env.LOG_LEVEL || 'info' });
export const echoRouter = Router();

const handleEcho = (req: Request, res: Response) => {
  const serverPort = (req.socket.localPort || 3001);
  const protocol = req.secure ? 'https' : 'http';

  logger.debug({
    module: 'routes.echo',
    method: req.method,
    body_size: req.body ? JSON.stringify(req.body).length : 0,
    headers_count: Object.keys(req.headers).length,
    server_port: serverPort,
    protocol,
  }, 'Echo request received');

  if (req.method === 'HEAD') {
    res.set('Content-Type', 'application/json');
    res.set('Content-Length', '0');
    return res.status(200).end();
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method);

  const response = {
    method: req.method,
    body: hasBody ? req.body : null,
    headers: {
      'user-agent': req.headers['user-agent'] || null,
      'x-run-id': req.headers['x-run-id'] || null,
      'x-seq': req.headers['x-seq'] || null,
    },
    content_length: hasBody ? (req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0) : 0,
    timestamp: new Date().toISOString(),
  };

  res.json(response);
};

echoRouter.all('/', handleEcho);
