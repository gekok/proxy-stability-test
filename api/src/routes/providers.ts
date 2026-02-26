import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { logger } from '../logger';
import { parsePagination, buildPaginationResponse } from '../middleware/pagination';

export const providersRouter = Router();

// POST /api/v1/providers
providersRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, website, notes } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      logger.warn({ module: 'routes.providers', validation_errors: ['name is required'], body_received: { name } }, 'Validation error');
      return res.status(400).json({ error: { message: 'name is required' } });
    }

    const result = await pool.query(
      `INSERT INTO provider (name, website, notes) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), website || null, notes || null],
    );

    logger.info({ module: 'routes.providers', provider_id: result.rows[0].id, name: name.trim() }, 'Provider created');
    res.status(201).json({ data: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { message: 'Provider name already exists' } });
    }
    next(err);
  }
});

// GET /api/v1/providers
providersRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, cursor } = parsePagination(req);

    const countResult = await pool.query('SELECT COUNT(*) FROM provider');
    const totalCount = parseInt(countResult.rows[0].count, 10);

    let query: string;
    let params: any[];

    if (cursor) {
      query = `SELECT * FROM provider WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT $3`;
      params = [cursor.created_at, cursor.id, limit + 1];
    } else {
      query = `SELECT * FROM provider ORDER BY created_at DESC, id DESC LIMIT $1`;
      params = [limit + 1];
    }

    const result = await pool.query(query, params);
    res.json(buildPaginationResponse(result.rows, limit, totalCount));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/providers/:id
providersRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM provider WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      logger.warn({ module: 'routes.providers', resource_type: 'provider', resource_id: req.params.id }, 'Not found');
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/providers/:id
providersRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, website, notes } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name.trim()); }
    if (website !== undefined) { fields.push(`website = $${idx++}`); values.push(website); }
    if (notes !== undefined) { fields.push(`notes = $${idx++}`); values.push(notes); }

    if (fields.length === 0) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    fields.push(`updated_at = now()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE provider SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }

    res.json({ data: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: { message: 'Provider name already exists' } });
    }
    next(err);
  }
});

// DELETE /api/v1/providers/:id
providersRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('DELETE FROM provider WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
