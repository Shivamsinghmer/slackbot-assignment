import { env } from './config/env.js';
import { apiLog } from './lib/logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler/cron.js';
import { closeSlackQueue } from './queue/slackQueue.js';

async function main() {
  await connectMongo();

  const server = createApp().listen(env.PORT, () => {
    apiLog.info(
      { port: env.PORT, mock: env.USE_MOCK_SLACK, mock_429_rate: env.MOCK_429_RATE },
      `API listening on http://localhost:${env.PORT}`,
    );
  });

  startScheduler();

  const shutdown = async (signal: string) => {
    apiLog.info(`${signal} received — shutting down API`);
    server.close();
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
