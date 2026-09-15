import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { logger } from '../lib/logger.js';
import { buildClientReports } from '../services/reportAggregation.js';
import { getReportWindow } from '../lib/dates.js';
import { formatCents, formatRoas } from '../services/blockKit.js';
import { DailyStat } from '../models/DailyStat.js';

/**
 * Prints the pipeline's output next to an independently-computed check so the
 * aggregation can be verified by eye. Usage: npm run verify:aggregation [YYYY-MM-DD]
 */
async function verify() {
  await connectMongo();

  const dateKey = process.argv[2];
  const window = getReportWindow(dateKey);
  const reports = await buildClientReports(dateKey);

  console.log(`\nReport window: ${window.start.toISOString()} → ${window.end.toISOString()}  (${window.dateKey})\n`);

  if (reports.length === 0) {
    console.log('No reports produced. Has the seed script been run?\n');
  }

  console.table(
    reports.map((r) => ({
      client: r.client_id,
      name: r.name,
      spend: formatCents(r.spend_cents),
      revenue: formatCents(r.revenue_cents),
      roas: formatRoas(r.roas),
      webhook: r.slack_webhook_url ? 'set' : '(empty)',
    })),
  );

  // Independent cross-check: count the raw rows the window should have covered.
  const rawCounts = await DailyStat.countDocuments({ date: { $gte: window.start, $lt: window.end } });
  console.log(`daily_stats rows inside the window (all clients, incl. opted-out): ${rawCounts}`);
  console.log(`clients in report output: ${reports.length}\n`);
  console.log('Expected: opted-out clients absent from the table above.\n');

  await disconnectMongo();
}

verify().catch(async (err) => {
  logger.error({ err: (err as Error).message }, 'verification failed');
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
