import { env } from '../config/env.js';
import { Settings, SETTINGS_ID } from '../models/Settings.js';

export interface RuntimeSettings {
  use_mock_slack: boolean;
  mock_429_rate: number;
  mock_retry_after_seconds: number;
}

const defaults: RuntimeSettings = {
  use_mock_slack: env.USE_MOCK_SLACK,
  mock_429_rate: env.MOCK_429_RATE,
  mock_retry_after_seconds: env.MOCK_RETRY_AFTER_SECONDS,
};

/**
 * Note: the 1 message/second delivery rate is deliberately NOT editable here.
 * It is the guarantee the whole queue exists to provide, and BullMQ fixes the
 * limiter when the worker is constructed. It lives in worker/slackWorker.ts.
 *
 * Cached briefly: the mock webhook reads these on every request, and a dispatch
 * of a few hundred clients should not mean a few hundred settings lookups.
 * 3s is short enough that a change in the dashboard takes effect immediately
 * enough to feel live.
 */
const CACHE_MS = 3000;
let cache: { value: RuntimeSettings; at: number } | null = null;

export async function getSettings(force = false): Promise<RuntimeSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const doc = await Settings.findById(SETTINGS_ID).lean();
  const value: RuntimeSettings = doc
    ? {
        use_mock_slack: doc.use_mock_slack,
        mock_429_rate: doc.mock_429_rate,
        mock_retry_after_seconds: doc.mock_retry_after_seconds,
      }
    : defaults;

  cache = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const current = await getSettings(true);
  const next = { ...current, ...patch };

  await Settings.findByIdAndUpdate(
    SETTINGS_ID,
    { $set: next },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  cache = { value: next, at: Date.now() };
  return next;
}

/** The env-derived values, so the UI can offer "reset to defaults". */
export function defaultSettings(): RuntimeSettings {
  return { ...defaults };
}
