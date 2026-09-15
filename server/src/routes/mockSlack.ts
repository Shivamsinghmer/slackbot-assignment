import { Router } from 'express';
import { env } from '../config/env.js';
import { apiLog } from '../lib/logger.js';

/**
 * Stand-in for a Slack incoming webhook.
 *
 * Triggering a real 429 from Slack means hammering their API and risking the
 * workspace, so this endpoint rejects a configurable share of requests with
 * 429 + Retry-After instead. Pointing the worker here exercises the queue's
 * pause-and-retry path without touching Slack at all.
 */
export const mockSlackRouter = Router();

mockSlackRouter.post('/mock-slack-webhook', (req, res) => {
  const roll = Math.random();

  if (roll < env.MOCK_429_RATE) {
    apiLog.warn(
      { retry_after: env.MOCK_RETRY_AFTER_SECONDS },
      `mock Slack → 429 Too Many Requests (Retry-After: ${env.MOCK_RETRY_AFTER_SECONDS}s)`,
    );
    res.set('Retry-After', String(env.MOCK_RETRY_AFTER_SECONDS));
    res.status(429).type('text/plain').send('rate_limited');
    return;
  }

  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks.length : 0;
  apiLog.info({ blocks, text: req.body?.text }, 'mock Slack → 200 ok');

  // Real Slack webhooks answer with the plain string "ok".
  res.status(200).type('text/plain').send('ok');
});
