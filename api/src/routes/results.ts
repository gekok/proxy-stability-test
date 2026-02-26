import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';

export const resultsRouter = Router();

// GET /api/v1/results/summaries — All summaries with optional filters
resultsRouter.get('/summaries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proxyId = req.query.proxy_id as string;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

    let query: string;
    let params: any[];

    if (proxyId) {
      query = `SELECT rs.*, pe.label as proxy_label, p.name as provider_name
               FROM run_summary rs
               JOIN proxy_endpoint pe ON rs.proxy_id = pe.id
               JOIN provider p ON pe.provider_id = p.id
               WHERE rs.proxy_id = $1
               ORDER BY rs.computed_at DESC LIMIT $2`;
      params = [proxyId, limit];
    } else {
      query = `SELECT rs.*, pe.label as proxy_label, p.name as provider_name
               FROM run_summary rs
               JOIN proxy_endpoint pe ON rs.proxy_id = pe.id
               JOIN provider p ON pe.provider_id = p.id
               ORDER BY rs.computed_at DESC LIMIT $1`;
      params = [limit];
    }

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});
