import { Router } from 'express';
import { z } from 'zod';
import { defaultSettings, getSettings, updateSettings } from '../services/settings.js';

export const settingsRouter = Router();

const patchSchema = z
  .object({
    use_mock_slack: z.boolean().optional(),
    mock_429_rate: z.number().min(0).max(1).optional(),
    mock_retry_after_seconds: z.number().int().min(1).max(60).optional(),
  })
  .strict();

settingsRouter.get('/settings', async (_req, res, next) => {
  try {
    res.json({ ...(await getSettings()), defaults: defaultSettings() });
  } catch (err) {
    next(err);
  }
});

settingsRouter.put('/settings', async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings', issues: parsed.error.issues });
      return;
    }
    const next_ = await updateSettings(parsed.data);
    res.json({ ...next_, defaults: defaultSettings() });
  } catch (err) {
    next(err);
  }
});

/** Restores everything to the values the environment was deployed with. */
settingsRouter.post('/settings/reset', async (_req, res, next) => {
  try {
    const value = await updateSettings(defaultSettings());
    res.json({ ...value, defaults: defaultSettings() });
  } catch (err) {
    next(err);
  }
});
