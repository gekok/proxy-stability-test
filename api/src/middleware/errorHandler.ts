import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  logger.error({
    module: 'middleware.errorHandler',
    error_message: err.message,
    stack_trace: err.stack,
    request_id: (req as any).id,
    path: req.path,
    error_type: err.name,
  }, 'Unhandled error');

  const statusCode = (err as any).statusCode || 500;

  if (statusCode === 500) {
    logger.error({
      module: 'middleware.errorHandler',
      request_id: (req as any).id,
      path: req.path,
      error_type: err.name,
    }, '500 returned');
  }

  res.status(statusCode).json({
    error: {
      message: statusCode === 500 ? 'Internal server error' : err.message,
      type: err.name,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}
