import { logger } from '../lib/logger.js';
import { seedWebhookUrls } from '../config/env.js';
import { Client } from '../models/Client.js';
import { DailyStat } from '../models/DailyStat.js';
import { NotificationLog } from '../models/NotificationLog.js';
import { startOfUtcDay } from '../lib/dates.js';

const CHANNELS = ['meta_ads', 'google_ads', 'tiktok_ads'] as const;

/** Per-client shape so the reports have visibly different ROAS values. */
const CLIENT_SEEDS = [
  { id: 'client_1', name: 'Brand A', enabled: true, spendRange: [40_000, 60_000], roasRange: [2.8, 3.4] },
  { id: 'client_2', name: 'Brand B', enabled: true, spendRange: [15_000, 25_000], roasRange: [1.6, 2.1] },
  { id: 'client_3', name: 'Brand C', enabled: true, spendRange: [90_000, 130_000], roasRange: [4.0, 5.2] },
  { id: 'client_4', name: 'Brand D', enabled: true, spendRange: [8_000, 14_000], roasRange: [0.7, 1.2] },
  // Opted out on purpose: proves the aggregation's $match actually excludes it.
  { id: 'client_5', name: 'Brand E', enabled: false, spendRange: [30_000, 45_000], roasRange: [2.0, 2.6] },
] as const;

const randBetween = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.round(randBetween(min, max));

export interface SeedResult {
  clients: number;
  stats: number;
}

/** Wipes and repopulates clients, daily_stats and notification_logs. */
export async function seedDatabase(): Promise<SeedResult> {
  const webhooks = seedWebhookUrls();
  const missing = webhooks.filter((w) => !w).length;
  if (missing > 0) {
    logger.warn(
      `${missing} of 5 SLACK_WEBHOOK_* values are unset — those clients seed with an empty URL. ` +
        'Set them here, or paste them into the dashboard once it is running.',
    );
  }

  await Promise.all([Client.deleteMany({}), DailyStat.deleteMany({}), NotificationLog.deleteMany({})]);

  await Client.insertMany(
    CLIENT_SEEDS.map((c, i) => ({
      _id: c.id,
      name: c.name,
      slack_notifications_enabled: c.enabled,
      slack_webhook_url: webhooks[i] ?? '',
    })),
  );

  // Three days of stats: today, yesterday (the day the report covers) and the
  // day before — enough to prove the date window actually filters.
  const today = startOfUtcDay(new Date());
  const stats: Array<Record<string, unknown>> = [];

  for (const client of CLIENT_SEEDS) {
    for (let daysAgo = 0; daysAgo < 3; daysAgo += 1) {
      const date = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      for (const channel of CHANNELS) {
        const spend_cents = randInt(client.spendRange[0], client.spendRange[1]);
        const roas = randBetween(client.roasRange[0], client.roasRange[1]);
        stats.push({
          client_id: client.id,
          // Spread through the day so a naive whole-day assumption shows up.
          date: new Date(date.getTime() + randInt(1, 22) * 60 * 60 * 1000),
          channel,
          spend_cents,
          revenue_cents: Math.round(spend_cents * roas),
        });
      }
    }
  }

  await DailyStat.insertMany(stats);
  await Promise.all([Client.syncIndexes(), DailyStat.syncIndexes(), NotificationLog.syncIndexes()]);

  return { clients: CLIENT_SEEDS.length, stats: stats.length };
}

/**
 * Seeds only when the database is empty.
 *
 * A fresh deployment points at an empty Atlas cluster, and a dashboard with no
 * clients is a dead page. This makes the first boot self-sufficient without
 * ever destroying data on subsequent restarts or redeploys.
 */
export async function seedIfEmpty(): Promise<SeedResult | null> {
  const existing = await Client.estimatedDocumentCount();
  if (existing > 0) return null;

  logger.info('no clients found — seeding demo data on first boot');
  const result = await seedDatabase();
  logger.info(result, 'seed complete');
  return result;
}
