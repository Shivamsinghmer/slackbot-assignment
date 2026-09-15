import cron from 'node-cron';
import { env } from '../config/env.js';
import { apiLog } from '../lib/logger.js';
import { dispatchDailyReports } from '../queue/producer.js';

/**
 * Daily 09:00 trigger. Calls exactly the same producer the dashboard's
 * "Send Now" button calls — one dispatch path, two ways to start it.
 *
 * Gated behind ENABLE_CRON so the API can be restarted freely during a demo
 * without a surprise dispatch firing.
 */
export function startScheduler(): void {
  if (!env.ENABLE_CRON) {
    apiLog.info('scheduler disabled (ENABLE_CRON=false)');
    return;
  }

  if (!cron.validate(env.CRON_SCHEDULE)) {
    apiLog.error({ schedule: env.CRON_SCHEDULE }, 'invalid CRON_SCHEDULE — scheduler not started');
    return;
  }

  cron.schedule(
    env.CRON_SCHEDULE,
    async () => {
      try {
        const result = await dispatchDailyReports({ trigger: 'cron' });
        apiLog.info(result, 'scheduled dispatch enqueued');
      } catch (err) {
        apiLog.error({ err: (err as Error).message }, 'scheduled dispatch failed');
      }
    },
    { timezone: env.CRON_TZ },
  );

  apiLog.info({ schedule: env.CRON_SCHEDULE, tz: env.CRON_TZ }, 'scheduler started');
}
