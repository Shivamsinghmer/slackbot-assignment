import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from './connection.js';

export const SLACK_QUEUE_NAME = 'slack-reports';
export const SEND_REPORT_JOB = 'send-report';

/** Everything the worker needs, captured at enqueue time. */
export interface SlackReportJob {
  logId: string;
  client_id: string;
  name: string;
  /** Resolved at enqueue time: the client's real Slack URL, or the mock endpoint. */
  webhook_url: string;
  target: 'slack' | 'mock';
  spend_cents: number;
  revenue_cents: number;
  roas: number;
  report_date: string;
}

export const defaultJobOptions: JobsOptions = {
  // Genuine failures (bad URL, network error) retry with backoff.
  // Rate limits do NOT consume these attempts — see worker/slackWorker.ts.
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 200,
  removeOnFail: false,
};

let queue: Queue<SlackReportJob> | null = null;

export function getSlackQueue(): Queue<SlackReportJob> {
  if (!queue) {
    queue = new Queue<SlackReportJob>(SLACK_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions,
    });
  }
  return queue;
}

export async function closeSlackQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
