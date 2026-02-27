import { Router } from 'express';
import { providersRouter } from './providers';
import { proxiesRouter } from './proxies';
import { runsRouter } from './runs';
import { resultsRouter } from './results';
import { exportRouter } from './export';

export const apiRouter = Router();

// Export router first — handles /providers/compare and /runs/:id/export
// Must be before /providers to avoid /:id catching "compare"
apiRouter.use('/', exportRouter);
apiRouter.use('/providers', providersRouter);
apiRouter.use('/proxies', proxiesRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/results', resultsRouter);
