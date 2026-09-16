import { env } from '../config/env.js';
import { getSettings } from '../services/settings.js';
import { getReportWindow } from '../lib/dates.js';
import { apiLog } from '../lib/logger.js';
import { NotificationLog } from '../models/NotificationLog.js';
import { buildClientReports } from '../services/reportAggregation.js';
import { getSlackQueue, SEND_REPORT_JOB, type SlackReportJob } from './slackQueue.js';

export interface DispatchOptions {
  /** YYYY-MM-DD. Defaults to yesterday (the 09:00 cron case). */
  dateKey?: string;
  /** Overrides USE_MOCK_SLACK for a single run — the dashboard's mock checkbox. */
  useMock?: boolean;
  /** Where the run came from, for logging. */
  trigger?: 'cron' | 'manual';
}

export interface DispatchResult {
  report_date: string;
  enqueued: number;
  clients: string[];
  target: 'slack' | 'mock';
}

const MOCK_ENDPOINT = `${env.API_BASE}/api/mock-slack-webhook`;

/**
 * The one dispatch path, shared by the 09:00 cron and the dashboard button.
 *
 * Deliberately does NOT send anything itself. It aggregates, records a pending
 * log row per client, and hands each report to Redis. Sending — and the 1 msg/sec
 * pacing that makes it safe — belongs to the worker.
 */
export async function dispatchDailyReports(opts: DispatchOptions = {}): Promise<DispatchResult> {
  // Explicit per-run override wins; otherwise the operator-editable setting.
  const settings = await getSettings();
  const useMock = opts.useMock ?? settings.use_mock_slack;
  const target: 'slack' | 'mock' = useMock ? 'mock' : 'slack';
  const trigger = opts.trigger ?? 'manual';

  // In mock mode the client's own URL is unused, so do not require one.
  const reports = await buildClientReports(opts.dateKey, !useMock);
  const queue = getSlackQueue();

  if (reports.length === 0) {
    const window = getReportWindow(opts.dateKey);
    apiLog.warn(
      { trigger, report_date: window.dateKey, require_webhook: !useMock },
      'dispatch produced no reports — no enabled client had data in the window' +
        (useMock ? '' : ' with a webhook URL set'),
    );
    return { report_date: window.dateKey, enqueued: 0, clients: [], target };
  }

  const reportDate = reports[0]!.report_date;
  apiLog.info(
    { trigger, target, report_date: reportDate, clients: reports.length },
    `dispatching ${reports.length} report(s) via ${target}`,
  );

  const clients: string[] = [];

  for (const report of reports) {
    // Upsert keeps a re-run of the same day on the same log row rather than
    // piling up duplicates in the dashboard table.
    const log = await NotificationLog.findOneAndUpdate(
      { client_id: report.client_id, report_date: report.report_date },
      {
        $set: {
          client_name: report.name,
          status: 'pending',
          spend_cents: report.spend_cents,
          revenue_cents: report.revenue_cents,
          roas: report.roas,
          target,
          last_error: null,
          sent_at: null,
          // Counters describe THIS dispatch — reset them so a re-run does not
          // show the previous run's attempts next to a fresh "pending" row.
          attempts: 0,
          rate_limit_hits: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const data: SlackReportJob = {
      logId: String(log._id),
      client_id: report.client_id,
      name: report.name,
      webhook_url: useMock ? MOCK_ENDPOINT : report.slack_webhook_url,
      target,
      spend_cents: report.spend_cents,
      revenue_cents: report.revenue_cents,
      roas: report.roas,
      report_date: report.report_date,
    };

    // Deterministic job id: one job per (client, report day). If a job for this
    // pair is still waiting or in flight we leave it alone rather than queueing
    // a second copy; a finished one is cleared so the run can be repeated.
    const jobId = `${report.client_id}__${report.report_date}`; // BullMQ forbids ":" in custom ids
    const existing = await queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'waiting-children') {
        apiLog.info({ client: report.client_id, state }, 'already queued for this date — skipping duplicate');
        continue;
      }
      await existing.remove();
    }

    await queue.add(SEND_REPORT_JOB, data, { jobId });
    await NotificationLog.updateOne({ _id: log._id }, { $set: { job_id: jobId } });
    clients.push(report.client_id);
  }

  return { report_date: reportDate, enqueued: clients.length, clients, target };
}
