import { Router } from 'express';
import { providersRouter } from './providers';
import { proxiesRouter } from './proxies';
import { runsRouter } from './runs';
import { resultsRouter } from './results';
import { exportRouter } from './export';

export const apiRouter = Router();

apiRouter.use('/providers', providersRouter);
apiRouter.use('/proxies', proxiesRouter);
apiRouter.use('/runs', runsRouter);
apiRouter.use('/results', resultsRouter);
apiRouter.use('/export', exportRouter);
