import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

// .env lives at the repo root so the API, the worker and the scripts all share one file.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

/** Accepts "true"/"false"/"1"/"0" from the environment. */
const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

const schema = z.object({
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required (Atlas connection string)'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // How long the worker blocks waiting for a job, in seconds. Every expiry of
  // that block costs one Redis command, which matters on metered hosts like
  // Upstash: the default of 5s burns ~17k commands/day while completely idle.
  // Raising it does NOT delay new jobs — the blocking read returns as soon as
  // one is pushed — it only makes the idle poll less chatty.
  REDIS_DRAIN_DELAY_SECONDS: z.coerce.number().int().min(1).max(300).default(5),

  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE: z.string().url().default('http://localhost:4000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  USE_MOCK_SLACK: boolish(true),
  MOCK_429_RATE: z.coerce.number().min(0).max(1).default(0.2),
  MOCK_RETRY_AFTER_SECONDS: z.coerce.number().int().min(1).default(3),

  // Single-service hosting (free tiers charge for a separate background
  // worker process) runs the worker inside the API process instead.
  RUN_WORKER_IN_PROCESS: boolish(false),

  // Seed demo data on first boot if the database is empty. Never overwrites
  // existing data; exists so a fresh deployment is not a dead page.
  AUTO_SEED: boolish(false),

  ENABLE_CRON: boolish(false),
  CRON_SCHEDULE: z.string().default('0 9 * * *'),
  CRON_TZ: z.string().default('Asia/Kolkata'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail at boot with a readable message rather than blowing up later inside a job.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\nInvalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.\n`);
  process.exit(1);
}

export const env = parsed.data;

/** Seed webhook URLs are read separately — only the seed script needs them. */
export function seedWebhookUrls(): (string | undefined)[] {
  return [1, 2, 3, 4, 5].map((n) => process.env[`SLACK_WEBHOOK_${n}`]?.trim() || undefined);
}
