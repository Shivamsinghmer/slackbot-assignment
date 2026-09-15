import { workerLog } from './lib/logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { createSlackWorker, RATE_LIMIT } from './worker/slackWorker.js';
import { env } from './config/env.js';

async function main() {
  // The worker writes dispatch outcomes back to notification_logs, so it needs
  // its own Mongo connection — it runs as a separate process from the API.
  await connectMongo();

  const worker = createSlackWorker();

  workerLog.info(
    { rate: `${RATE_LIMIT.max}/${RATE_LIMIT.duration}ms`, redis: env.REDIS_URL },
    `worker online — draining slack-reports at ${RATE_LIMIT.max} message per ${RATE_LIMIT.duration / 1000}s`,
  );

  const shutdown = async (signal: string) => {
    workerLog.info(`${signal} received — finishing current job then exiting`);
    await worker.close();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  workerLog.error({ err: (err as Error).message }, 'failed to start worker');
  process.exit(1);
});
