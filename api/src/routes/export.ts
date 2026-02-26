import { Router, Request, Response } from 'express';

export const exportRouter = Router();

// Placeholder for Sprint 4
exportRouter.get('/runs/:id/export', (_req: Request, res: Response) => {
  res.json({ message: 'Export not implemented in Sprint 1' });
});

exportRouter.get('/providers/compare', (_req: Request, res: Response) => {
  res.json({ message: 'Provider comparison not implemented in Sprint 1' });
});
