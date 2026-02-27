import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { generateJSON, generateCSV, compareProviders } from '../services/exportService';

export const exportRouter = Router();

// GET /api/v1/runs/:id/export?format=json|csv
exportRouter.get('/runs/:id/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const runId = req.params.id;
    const format = (req.query.format as string) || 'json';

    logger.info({ module: 'routes.export', run_id: runId, format }, 'Export requested');

    if (format === 'csv') {
      const csv = await generateCSV(runId);
      logger.info({ module: 'routes.export', run_id: runId, format: 'csv', size_bytes: csv.length }, 'Export generated');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="run-${runId.slice(0, 8)}.csv"`);
      return res.send(csv);
    }

    const data = await generateJSON(runId);
    const json = JSON.stringify(data, null, 2);
    logger.info({
      module: 'routes.export',
      run_id: runId,
      format: 'json',
      http_samples: data.http_samples.length,
      ws_samples: data.ws_samples.length,
    }, 'Export generated');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="run-${runId.slice(0, 8)}.json"`);
    return res.send(json);
  } catch (err: any) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    }
    logger.error({ module: 'routes.export', run_id: req.params.id, format: req.query.format, error_detail: err.message }, 'Export fail');
    next(err);
  }
});

// GET /api/v1/providers/compare?provider_ids=a,b,c
exportRouter.get('/providers/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idsParam = req.query.provider_ids as string;
    if (!idsParam) {
      return res.status(400).json({ error: { code: 'MISSING_IDS', message: 'provider_ids query param required' } });
    }

    const providerIds = idsParam.split(',').filter(Boolean);
    logger.info({ module: 'routes.export', provider_count: providerIds.length, provider_ids: providerIds }, 'Compare requested');

    if (providerIds.length < 2) {
      return res.status(400).json({ error: { code: 'MIN_PROVIDERS', message: 'Need at least 2 providers' } });
    }
    if (providerIds.length > 5) {
      return res.status(400).json({ error: { code: 'MAX_PROVIDERS', message: 'Max 5 providers' } });
    }

    const data = await compareProviders(providerIds);
    logger.info({ module: 'routes.export', provider_count: data.length, providers: data.map(d => d.provider_name) }, 'Compare generated');
    res.json({ data });
  } catch (err: any) {
    logger.error({ module: 'routes.export', provider_ids: req.query.provider_ids, error_detail: err.message }, 'Compare fail');
    next(err);
  }
});
