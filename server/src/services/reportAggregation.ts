import { Client } from '../models/Client.js';
import { getReportWindow, type ReportWindow } from '../lib/dates.js';

/** One client's finished report — everything the worker needs to post to Slack. */
export interface ClientReport {
  client_id: string;
  name: string;
  slack_webhook_url: string;
  spend_cents: number;
  revenue_cents: number;
  roas: number;
  report_date: string;
}

/**
 * Builds every opted-in client's previous-day report in a single MongoDB
 * aggregation. The sums and the ROAS division are computed by the database —
 * no stats document is ever loaded into Node and reduced in JavaScript.
 *
 * Shape: clients ──$match──▶ opted-in only
 *                 ──$lookup──▶ date-windowed $group over daily_stats
 *                 ──$unwind──▶ drop clients with no spend in the window
 *                 ──$project─▶ ROAS via $divide, guarded by $cond
 */
export async function buildClientReports(dateKey?: string): Promise<ClientReport[]> {
  const window = getReportWindow(dateKey);
  return runReportPipeline(window);
}

export async function runReportPipeline(window: ReportWindow): Promise<ClientReport[]> {
  const rows = await Client.aggregate<Omit<ClientReport, 'report_date'>>([
    // 1. Only clients who opted in AND actually have somewhere to send to.
    {
      $match: {
        slack_notifications_enabled: true,
        slack_webhook_url: { $exists: true, $nin: [null, ''] },
      },
    },

    // 2. Pull in ONLY the stats inside the report window, already summed.
    //    Filtering inside the sub-pipeline means Mongo never materialises the
    //    client's full stats history just to throw most of it away.
    {
      $lookup: {
        from: 'daily_stats',
        let: { cid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$client_id', '$$cid'] },
                  { $gte: ['$date', window.start] },
                  { $lt: ['$date', window.end] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              spend_cents: { $sum: '$spend_cents' },
              revenue_cents: { $sum: '$revenue_cents' },
            },
          },
        ],
        as: 'stats',
      },
    },

    // 3. A client with no activity in the window has an empty `stats` array and
    //    is dropped here — we don't send "$0.00 / 0.00x" noise to a client.
    { $unwind: { path: '$stats', preserveNullAndEmptyArrays: false } },

    // 4. ROAS = revenue / spend, rounded to 2dp, with a divide-by-zero guard.
    {
      $project: {
        _id: 0,
        client_id: '$_id',
        name: 1,
        slack_webhook_url: 1,
        spend_cents: '$stats.spend_cents',
        revenue_cents: '$stats.revenue_cents',
        roas: {
          $cond: [
            { $gt: ['$stats.spend_cents', 0] },
            { $round: [{ $divide: ['$stats.revenue_cents', '$stats.spend_cents'] }, 2] },
            0,
          ],
        },
      },
    },

    { $sort: { client_id: 1 } },
  ]);

  return rows.map((r) => ({ ...r, report_date: window.dateKey }));
}
