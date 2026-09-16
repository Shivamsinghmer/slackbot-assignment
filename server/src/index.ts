import { env } from './config/env.js';
import { apiLog } from './lib/logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler/cron.js';
import { closeSlackQueue } from './queue/slackQueue.js';
import { verifyRedis } from './queue/connection.js';
import { createSlackWorker } from './worker/slackWorker.js';
import { seedIfEmpty } from './services/seedData.js';
import type { Worker } from 'bullmq';
import type { SlackReportJob } from './queue/slackQueue.js';

async function main() {
  await connectMongo();

  if (env.AUTO_SEED) await seedIfEmpty();

  await verifyRedis();

  const server = createApp().listen(env.PORT, () => {
    apiLog.info(
      { port: env.PORT, mock: env.USE_MOCK_SLACK, mock_429_rate: env.MOCK_429_RATE },
      `API listening on http://localhost:${env.PORT}`,
    );
  });

  startScheduler();

  // On a single-service deployment the worker shares this process. Locally it
  // stays a separate process (npm run worker) so its log output is readable on
  // its own and it can be restarted independently.
  let inProcessWorker: Worker<SlackReportJob> | null = null;
  if (env.RUN_WORKER_IN_PROCESS) {
    inProcessWorker = createSlackWorker();
    apiLog.info('worker running in-process (RUN_WORKER_IN_PROCESS=true)');
  }

  const shutdown = async (signal: string) => {
    apiLog.info(`${signal} received — shutting down API`);
    server.close();
    if (inProcessWorker) await inProcessWorker.close();
    await closeSlackQueue();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  apiLog.error({ err: (err as Error).message }, 'failed to start API');
  process.exit(1);
});
