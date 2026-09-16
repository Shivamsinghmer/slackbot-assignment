import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { apiLog } from './lib/logger.js';
import { clientsRouter } from './routes/clients.js';
import { logsRouter } from './routes/logs.js';
import { dispatchRouter } from './routes/dispatch.js';
import { mockSlackRouter } from './routes/mockSlack.js';
import { settingsRouter } from './routes/settings.js';
import { getSettings } from './services/settings.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', async (_req, res, next) => {
    try {
      const s = await getSettings();
      res.json({ ok: true, use_mock_slack: s.use_mock_slack, mock_429_rate: s.mock_429_rate });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', clientsRouter);
  app.use('/api', logsRouter);
  app.use('/api', dispatchRouter);
  app.use('/api', mockSlackRouter);
  app.use('/api', settingsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    apiLog.error({ err: err.message, stack: err.stack }, 'unhandled API error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
