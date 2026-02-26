import { Router, Request, Response } from 'express';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });
});
