import pino from 'pino';

export const logger = pino({
  name: 'dashboard',
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'dashboard' },
});

logger.info({
  api_url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  node_env: process.env.NODE_ENV || 'development',
  log_level: process.env.LOG_LEVEL || 'info',
  module: 'startup',
}, 'Dashboard started');
