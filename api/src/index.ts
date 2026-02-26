import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/errorHandler';
import './db/pool'; // Initialize pool on startup

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// CORS — allow Dashboard (:3000) to call API (:8000)
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Request logging with pino-http
app.use(pinoHttp({
  logger,
  genReqId: () => uuidv4(),
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1', apiRouter);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info({
    module: 'index',
    port: PORT,
    node_version: process.version,
  }, 'API server started');
});
