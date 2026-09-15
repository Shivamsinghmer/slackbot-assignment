import { Router } from 'express';
import { z } from 'zod';
import { dispatchDailyReports } from '../queue/producer.js';
import { getSlackQueue } from '../queue/slackQueue.js';

export const dispatchRouter = Router();

const runSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  useMock: z.boolean().optional(),
});

/**
 * Manual trigger for the same code path the 09:00 cron runs. Exists so the
 * dispatch (and the 429 retry behaviour) can be demonstrated on demand instead
 * of waiting for the scheduled run.
 */
dispatchRouter.post('/dispatch/run', async (req, res, next) => {
  try {
    const parsed = runSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
      return;
    }

    const result = await dispatchDailyReports({
      dateKey: parsed.data.date,
      useMock: parsed.data.useMock,
      trigger: 'manual',
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Live queue depth — lets the dashboard show that work is genuinely queued. */
dispatchRouter.get('/queue/status', async (_req, res, next) => {
  try {
    const queue = getSlackQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    res.json(counts);
  } catch (err) {
    next(err);
  }
});
