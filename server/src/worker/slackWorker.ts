import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { workerLog } from '../lib/logger.js';
import { NotificationLog } from '../models/NotificationLog.js';
import { createRedisConnection } from '../queue/connection.js';
import { SLACK_QUEUE_NAME, type SlackReportJob } from '../queue/slackQueue.js';
import { buildReportMessage, formatRoas } from '../services/blockKit.js';

/**
 * Slack allows roughly one message per second per incoming webhook. These two
 * options together are what stop us from ever exceeding that:
 *
 *   concurrency: 1        — never two requests in flight at once
 *   limiter { 1 / 1000ms } — at most one job STARTS per second
 *
 * The limiter is enforced in Redis, not in process memory, so the rate holds
 * even if several worker processes are running against the same queue.
 */
export const RATE_LIMIT = { max: 1, duration: 1000 } as const;

const DEFAULT_RETRY_AFTER_SECONDS = 3;

/** Slack sends Retry-After in whole seconds; fall back if it is missing or junk. */
function parseRetryAfter(header: string | null): number {
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
}

export function createSlackWorker(): Worker<SlackReportJob> {
  const worker = new Worker<SlackReportJob>(
    SLACK_QUEUE_NAME,
    async (job: Job<SlackReportJob>) => {
      const { logId, name, webhook_url, report_date, roas } = job.data;
      const payload = buildReportMessage(job.data);

      const response = await fetch(webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // ---- 429: pause the whole queue, then retry this exact job ----
      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));

        await NotificationLog.updateOne(
          { _id: logId },
          {
            $inc: { rate_limit_hits: 1 },
            $set: {
              status: 'pending',
              last_error: `429 rate limited — pausing ${retryAfterSeconds}s, will retry`,
            },
          },
        );

        workerLog.warn(
          { client: name, retry_after_s: retryAfterSeconds, job: job.id },
          `429 Too Many Requests — pausing queue ${retryAfterSeconds}s and re-queueing ${name}`,
        );

        // Pause the ENTIRE worker for exactly the duration the server asked for.
        // Other clients' jobs wait too, which is correct: the rate limit is on
        // the destination, not on this one message.
        await worker.rateLimit(retryAfterSeconds * 1000);

        // Return the job to `waiting` WITHOUT incrementing attemptsMade. A rate
        // limit is not a failure — if it counted against `attempts: 5`, a client
        // throttled six times would be marked failed and its report dropped.
        // This is the line that guarantees "retry without dropping the message".
        throw Worker.RateLimitError();
      }

      const body = await response.text();

      // ---- Permanent failures: don't burn five attempts on a broken URL ----
      if (response.status === 404 || response.status === 403 || response.status === 410) {
        throw new UnrecoverableError(`Slack rejected the webhook (${response.status}): ${body}`);
      }

      // ---- Transient failures: let BullMQ retry with exponential backoff ----
      if (!response.ok) {
        throw new Error(`Slack responded ${response.status}: ${body}`);
      }

      await NotificationLog.updateOne(
        { _id: logId },
        {
          $inc: { attempts: 1 },
          $set: { status: 'sent', sent_at: new Date(), last_error: null },
        },
      );

      workerLog.info(
        { client: name, report_date, roas: formatRoas(roas) },
        `sent → ${name}  (ROAS ${formatRoas(roas)})`,
      );

      return { ok: true };
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
      limiter: { ...RATE_LIMIT },
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) {
      workerLog.error({ err: err.message }, 'job failed before it could be loaded');
      return;
    }

    const attemptsAllowed = job.opts.attempts ?? 1;
    const exhausted = err instanceof UnrecoverableError || job.attemptsMade >= attemptsAllowed;

    await NotificationLog.updateOne(
      { _id: job.data.logId },
      {
        $inc: { attempts: 1 },
        $set: {
          status: exhausted ? 'failed' : 'pending',
          last_error: err.message,
        },
      },
    );

    if (exhausted) {
      workerLog.error(
        { client: job.data.name, attempts: job.attemptsMade, err: err.message },
        `giving up on ${job.data.name} after ${job.attemptsMade} attempt(s)`,
      );
    } else {
      workerLog.warn(
        { client: job.data.name, attempt: job.attemptsMade, of: attemptsAllowed, err: err.message },
        `attempt ${job.attemptsMade}/${attemptsAllowed} failed for ${job.data.name} — retrying with backoff`,
      );
    }
  });

  worker.on('error', (err) => {
    workerLog.error({ err: err.message }, 'worker error');
  });

  return worker;
}
