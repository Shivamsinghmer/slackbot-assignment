import { Router } from 'express';
import { apiLog } from '../lib/logger.js';
import { getSettings } from '../services/settings.js';

/**
 * Stand-in for a Slack incoming webhook.
 *
 * Triggering a real 429 from Slack means hammering their API and risking the
 * workspace, so this endpoint rejects a configurable share of requests with
 * 429 + Retry-After instead. Pointing the worker here exercises the queue's
 * pause-and-retry path without touching Slack at all.
 */
export const mockSlackRouter = Router();

mockSlackRouter.post('/mock-slack-webhook', async (req, res, next) => {
  try {
    const { mock_429_rate, mock_retry_after_seconds } = await getSettings();

    if (Math.random() < mock_429_rate) {
      apiLog.warn(
        { retry_after: mock_retry_after_seconds },
        `mock Slack → 429 Too Many Requests (Retry-After: ${mock_retry_after_seconds}s)`,
      );
      res.set('Retry-After', String(mock_retry_after_seconds));
      res.status(429).type('text/plain').send('rate_limited');
      return;
    }

    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks.length : 0;
    apiLog.info({ blocks, text: req.body?.text }, 'mock Slack → 200 ok');

    // Real Slack webhooks answer with the plain string "ok".
    res.status(200).type('text/plain').send('ok');
  } catch (err) {
    next(err);
  }
});
