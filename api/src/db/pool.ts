import { Pool } from 'pg';
import { logger } from '../logger';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://proxytest:proxytest@localhost:5432/proxytest';

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
});

pool.on('connect', () => {
  logger.info({
    module: 'db.pool',
    host: DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown',
    database: DATABASE_URL.split('/').pop() || 'unknown',
    pool_size: 20,
  }, 'Pool connected');
});

pool.on('error', (err) => {
  logger.fatal({
    module: 'db.pool',
    error_detail: err.message,
  }, 'Pool connection fail');
});

// Test connection on startup
pool.query('SELECT 1').catch((err) => {
  logger.fatal({
    module: 'db.pool',
    host: DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown',
    error_detail: err.message,
  }, 'Pool connection fail');
});
