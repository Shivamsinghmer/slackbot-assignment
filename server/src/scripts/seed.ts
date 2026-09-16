import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { logger } from '../lib/logger.js';
import { seedDatabase } from '../services/seedData.js';

async function main() {
  await connectMongo();
  const result = await seedDatabase();
  logger.info(
    `seeded ${result.clients} clients and ${result.stats} daily_stats rows (3 days x 3 channels)`,
  );
  await disconnectMongo();
}

main().catch(async (err) => {
  logger.error({ err: (err as Error).message }, 'seed failed');
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
