import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool';
import { logger } from '../logger';
import { parsePagination, buildPaginationResponse } from '../middleware/pagination';

export const proxiesRouter = Router();

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const KEY = Buffer.from(KEY_HEX, 'hex');

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encryptedStr: string): string {
  const [ivB64, tagB64, dataB64] = encryptedStr.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

function stripPassword(row: any) {
  const { auth_pass_enc, ...rest } = row;
  return { ...rest, has_password: !!auth_pass_enc };
}

// POST /api/v1/proxies
proxiesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider_id, label, host, port, protocol, auth_user, auth_pass, expected_country, expected_city, is_dedicated } = req.body;

    if (!provider_id || !label || !host || !port) {
      logger.warn({ module: 'routes.proxies', validation_errors: ['provider_id, label, host, port are required'] }, 'Validation error');
      return res.status(400).json({ error: { message: 'provider_id, label, host, port are required' } });
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ error: { message: 'port must be between 1 and 65535' } });
    }

    let authPassEnc: string | null = null;
    if (auth_pass && auth_pass.length > 0) {
      try {
        authPassEnc = encrypt(auth_pass);
        logger.debug({ module: 'routes.proxies', proxy_label: label }, 'Password encrypted');
      } catch (err: any) {
        logger.error({ module: 'routes.proxies', proxy_label: label, error_detail: err.message }, 'Password encrypt fail');
        return res.status(500).json({ error: { message: 'Failed to encrypt password' } });
      }
    }

    const result = await pool.query(
      `INSERT INTO proxy_endpoint (provider_id, label, host, port, protocol, auth_user, auth_pass_enc, expected_country, expected_city, is_dedicated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [provider_id, label, host, portNum, protocol || 'http', auth_user || null, authPassEnc, expected_country || null, expected_city || null, is_dedicated || false],
    );

    res.status(201).json({ data: stripPassword(result.rows[0]) });
  } catch (err: any) {
    if (err.code === '23503') {
      return res.status(400).json({ error: { message: 'Provider not found' } });
    }
    next(err);
  }
});

// GET /api/v1/proxies
proxiesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, cursor } = parsePagination(req);
    const providerId = req.query.provider_id as string;

    let countQuery = 'SELECT COUNT(*) FROM proxy_endpoint';
    let countParams: any[] = [];
    if (providerId) {
      countQuery += ' WHERE provider_id = $1';
      countParams = [providerId];
    }
    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    let query: string;
    let params: any[];

    if (providerId) {
      if (cursor) {
        query = `SELECT * FROM proxy_endpoint WHERE provider_id = $1 AND (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC LIMIT $4`;
        params = [providerId, cursor.created_at, cursor.id, limit + 1];
      } else {
        query = `SELECT * FROM proxy_endpoint WHERE provider_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`;
        params = [providerId, limit + 1];
      }
    } else {
      if (cursor) {
        query = `SELECT * FROM proxy_endpoint WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT $3`;
        params = [cursor.created_at, cursor.id, limit + 1];
      } else {
        query = `SELECT * FROM proxy_endpoint ORDER BY created_at DESC, id DESC LIMIT $1`;
        params = [limit + 1];
      }
    }

    const result = await pool.query(query, params);
    const rows = result.rows.map(stripPassword);
    res.json(buildPaginationResponse(rows, limit, totalCount));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/proxies/:id
proxiesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('SELECT * FROM proxy_endpoint WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      logger.warn({ module: 'routes.proxies', resource_type: 'proxy', resource_id: req.params.id }, 'Not found');
      return res.status(404).json({ error: { message: 'Proxy not found' } });
    }
    res.json({ data: stripPassword(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/proxies/:id
proxiesRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label, host, port, protocol, auth_user, auth_pass, expected_country, expected_city, is_dedicated } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (label !== undefined) { fields.push(`label = $${idx++}`); values.push(label); }
    if (host !== undefined) { fields.push(`host = $${idx++}`); values.push(host); }
    if (port !== undefined) { fields.push(`port = $${idx++}`); values.push(parseInt(port, 10)); }
    if (protocol !== undefined) { fields.push(`protocol = $${idx++}`); values.push(protocol); }
    if (auth_user !== undefined) { fields.push(`auth_user = $${idx++}`); values.push(auth_user); }
    if (auth_pass !== undefined) {
      const enc = auth_pass.length > 0 ? encrypt(auth_pass) : null;
      fields.push(`auth_pass_enc = $${idx++}`);
      values.push(enc);
    }
    if (expected_country !== undefined) { fields.push(`expected_country = $${idx++}`); values.push(expected_country); }
    if (expected_city !== undefined) { fields.push(`expected_city = $${idx++}`); values.push(expected_city); }
    if (is_dedicated !== undefined) { fields.push(`is_dedicated = $${idx++}`); values.push(is_dedicated); }

    if (fields.length === 0) {
      return res.status(400).json({ error: { message: 'No fields to update' } });
    }

    fields.push(`updated_at = now()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE proxy_endpoint SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Proxy not found' } });
    }

    res.json({ data: stripPassword(result.rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/proxies/:id
proxiesRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query('DELETE FROM proxy_endpoint WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Proxy not found' } });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
