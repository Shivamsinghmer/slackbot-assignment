# Slack Report Dispatcher

Delivers daily ad-attribution reports (Spend, Revenue, ROAS) to each client's Slack channel — at a
strict one message per second, pausing and retrying automatically whenever Slack returns
`429 Too Many Requests`.

Slack's incoming webhooks accept roughly one message per second. Sending a few hundred client
reports concurrently gets most of them rejected and silently dropped. This service queues every
report in Redis and drains the queue at a controlled pace, so a dispatch to hundreds of channels
completes without losing a single message.

---

## Features

- **Single-pipeline aggregation** — per-client spend, revenue and ROAS computed entirely inside
  MongoDB, never summed in application memory.
- **Rate-limited delivery** — a Redis-backed limiter caps outbound messages at 1/sec across every
  worker process.
- **Automatic 429 recovery** — reads the `Retry-After` header, pauses the queue for exactly that
  long, and re-queues the message without consuming its retry budget.
- **Delivery tracking** — every dispatch is recorded with status, attempt count and rate-limit hits.
- **Scheduled or on-demand** — a daily cron trigger and a manual endpoint share one code path.
- **Built-in mock endpoint** — a local webhook that injects 429s, so rate-limit handling can be
  exercised without touching Slack.
- **Settings dashboard** — React UI for webhook configuration, per-client on/off, and live logs.

---

## Architecture

```
  cron 09:00 ───┐
                ├──▶  producer  ──▶  Redis (BullMQ)  ──▶  worker  ──▶  Slack webhook
  manual run ───┘        │           "slack-reports"       │             (or mock)
                         │                                 │
                MongoDB aggregation              1 msg/sec, pauses
                + notification_logs              on 429 Retry-After
```

The API never posts to Slack itself. It aggregates the data, writes a `pending` log row per client,
and hands the work to Redis. Delivery — and the pacing that makes it safe — belongs entirely to the
worker, which runs as a **separate process** and can be scaled or restarted independently.

**Stack:** Node.js · TypeScript · Express · MongoDB (Mongoose) · Redis (BullMQ) · React · Vite ·
Tailwind CSS

---

## Prerequisites

- Node.js 20 or newer
- Docker (for Redis)
- A MongoDB connection string — MongoDB Atlas free tier works fine

---

## Setup

### 1. Install dependencies

```bash
npm install
```

This is an npm workspaces monorepo; the single install covers both `server/` and `client/`.

### 2. Create your environment file

```bash
cp .env.example .env
```

Fill in `MONGODB_URI` and, when you are ready to post to real channels, the five
`SLACK_WEBHOOK_*` values. Everything else has a working default. See
[Configuration](#configuration) for the full list.

### 3. Start Redis

```bash
docker compose up -d
```

Redis runs on port 6379 with append-only persistence, so queued work survives a restart.

### 4. Seed the database

```bash
npm run seed
```

Creates 5 client records and 45 `daily_stats` rows (5 clients x 3 days x 3 ad channels). One client
is seeded with notifications disabled so you can confirm opted-out clients are excluded.

Verify the aggregation before sending anything:

```bash
npm run verify:aggregation
```

This prints each client's computed spend, revenue and ROAS next to a raw row count, so the numbers
can be checked by hand.

### 5. Run the services

Three processes, each in its own terminal:

```bash
npm run dev
```

```bash
npm run worker
```

```bash
npm run web
```

| Process | URL | Role |
|---|---|---|
| `dev` | http://localhost:4000 | API, scheduler, mock webhook |
| `worker` | — | Drains the queue and posts to Slack |
| `web` | http://localhost:5173 | Settings dashboard |

The dashboard proxies `/api` to port 4000, so no extra CORS setup is needed in development.

---

## Connecting Slack

Delivery uses Incoming Webhooks — no OAuth flow required.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and choose **Blank app**.
2. Name the app and select your workspace.
3. Open **Incoming Webhooks** in the sidebar and switch **Activate Incoming Webhooks** on.
4. Create one Slack channel per client, for example `#client-1-report` through `#client-5-report`.
5. Click **Add New Webhook to Workspace** once per channel and authorise it.
6. Copy each generated URL into `SLACK_WEBHOOK_1` … `SLACK_WEBHOOK_5` in `.env`.
7. Re-run `npm run seed` so the client records pick up the new URLs.
8. Set `USE_MOCK_SLACK=false` and restart the API.

Webhook URLs are credentials. `.env` is gitignored and the dashboard masks saved URLs by default.

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | — | MongoDB connection string, including the database name |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `PORT` | `4000` | API port |
| `API_BASE` | `http://localhost:4000` | Used to build the mock webhook URL |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed dashboard origin(s), comma-separated |
| `LOG_LEVEL` | `info` | pino log level |
| `USE_MOCK_SLACK` | `true` | Route messages to the local mock endpoint instead of Slack |
| `MOCK_429_RATE` | `0.2` | Fraction of mock requests answered with 429 |
| `MOCK_RETRY_AFTER_SECONDS` | `3` | `Retry-After` value the mock returns |
| `ENABLE_CRON` | `false` | Arm the scheduled daily dispatch |
| `CRON_SCHEDULE` | `0 9 * * *` | When the daily dispatch runs |
| `CRON_TZ` | `Asia/Kolkata` | Timezone for the schedule |
| `SLACK_WEBHOOK_1..5` | — | Webhook URLs used as seed data |

Configuration is validated with zod at startup. A missing or malformed value fails immediately with
a readable message rather than surfacing later inside a job.

---

## How delivery works

### Pacing

```ts
new Worker('slack-reports', handler, {
  concurrency: 1,                       // never two requests in flight
  limiter: { max: 1, duration: 1000 },  // at most one job starts per second
});
```

The limiter state lives in Redis rather than process memory, so the ceiling holds even when several
worker processes share the queue.

### Rate-limit recovery

```ts
if (response.status === 429) {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
  await worker.rateLimit(retryAfterSeconds * 1000);  // pause the whole queue
  throw Worker.RateLimitError();                     // re-queue without burning an attempt
}
```

Two deliberate choices:

1. **The pause applies to the entire worker**, not just the rejected job. The limit belongs to the
   destination, so every pending message waits rather than piling on.
2. **`Worker.RateLimitError()` does not increment `attemptsMade`.** A plain throw would count against
   `attempts: 5`, so a client throttled six times would be marked failed and its report lost. Rate
   limiting is backpressure, not failure — this is what makes retry-without-drop hold under sustained
   throttling.

Genuine errors still retry with exponential backoff before being marked `failed`. Permanent
rejections (`403`, `404`, `410` — a revoked or mistyped webhook) raise `UnrecoverableError` and stop
immediately instead of consuming all five attempts.

### Aggregation

`server/src/services/reportAggregation.ts` builds every report in one pipeline:

```
$match   → clients that are opted in and have a webhook URL
$lookup  → daily_stats, date-windowed and $group-summed in the sub-pipeline
$unwind  → drop clients with no activity in the window
$project → ROAS via $divide, guarded against divide-by-zero with $cond
```

Filtering inside the `$lookup` sub-pipeline means MongoDB never materialises a client's full history
only to discard most of it. No stats document reaches application memory.

Monetary values are stored and moved as integer cents throughout, and converted to currency only at
the formatting boundary, so float rounding never affects a ROAS figure.

---

## Exercising rate-limit handling locally

Provoking a real 429 means hammering Slack's API, so the server hosts its own webhook at
`POST /api/mock-slack-webhook` that rejects a configurable share of requests with `429` and
`Retry-After: 3`.

In `.env`:

```
USE_MOCK_SLACK=true
MOCK_429_RATE=0.6
```

Restart the API and trigger a dispatch. The worker output shows the pause and recovery:

```
10:03:20  INFO  sent → Brand A  (ROAS 3.22x)
10:03:21  WARN  429 Too Many Requests — pausing queue 3s and re-queueing Brand B
10:03:24  WARN  429 Too Many Requests — pausing queue 3s and re-queueing Brand B
10:03:28  WARN  429 Too Many Requests — pausing queue 3s and re-queueing Brand B
10:03:31  WARN  429 Too Many Requests — pausing queue 3s and re-queueing Brand B
10:03:34  INFO  sent → Brand B  (ROAS 1.93x)
```

Each pause matches the requested three seconds, and the message is delivered after four consecutive
rejections rather than dropped. Afterwards every row in `notification_logs` reads `sent`, and the
dashboard shows the rate-limit count per client as an amber `429 xN` badge.

**Checking the 1/sec pace in isolation:** set `MOCK_429_RATE=0`, restart, dispatch. Worker timestamps
land roughly 1000 ms apart.

**Checking durability:** stop the worker mid-dispatch with Ctrl-C, then start it again. Remaining
jobs are still in Redis and resume. Job ids are `clientId__reportDate`, so nothing is sent twice.

---

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness and current delivery mode |
| `GET` | `/api/clients` | List all clients |
| `GET` | `/api/clients/:id` | Fetch a single client |
| `PUT` | `/api/clients/:id` | Update webhook URL and/or notification toggle |
| `GET` | `/api/logs?limit=50` | Recent delivery history |
| `POST` | `/api/dispatch/run` | Trigger a dispatch — body `{ date?, useMock? }` |
| `GET` | `/api/queue/status` | Live BullMQ job counts |
| `POST` | `/api/mock-slack-webhook` | Local mock webhook that injects 429s |

`POST /api/dispatch/run` runs the same producer the scheduler calls, so a dispatch can be triggered
on demand without waiting for the daily window. Passing `date` re-runs an earlier day; passing
`useMock` overrides the environment setting for that run only.

---

## Data model

```
clients             { _id, name, slack_notifications_enabled, slack_webhook_url }
daily_stats         { client_id, date, channel, spend_cents, revenue_cents }
notification_logs   { client_id, client_name, report_date, status, attempts,
                      rate_limit_hits, spend_cents, revenue_cents, roas,
                      target, job_id, last_error, sent_at }
```

`notification_logs` carries one row per client per report date, upserted on each dispatch. It backs
the dashboard table and records how many rate-limit pauses a message absorbed before landing.

---

## Project structure

```
server/src/
  services/reportAggregation.ts   MongoDB aggregation pipeline
  services/blockKit.ts            Slack Block Kit message formatting
  worker/slackWorker.ts           Rate limiter and 429 handling
  queue/producer.ts               Aggregate, log, enqueue
  queue/slackQueue.ts             Queue definition and job options
  routes/                         clients, logs, dispatch, mock webhook
  scheduler/cron.ts               Daily trigger
  scripts/seed.ts                 Seed data
  scripts/verifyAggregation.ts    Pipeline output inspection
  config/env.ts                   Validated configuration
client/src/
  App.tsx                         Dashboard
  components/                     Settings card, dispatch panel, logs table
  api/client.ts                   Typed API wrapper
```

---

## Scripts

| Command | Effect |
|---|---|
| `npm run dev` | Start the API with hot reload |
| `npm run worker` | Start the delivery worker |
| `npm run web` | Start the dashboard |
| `npm run seed` | Reset and populate the database |
| `npm run verify:aggregation` | Print pipeline output for inspection |
| `npm run redis:up` / `redis:down` | Start or stop the Redis container |
| `npm run build` | Type-check and build both workspaces |

---

## Troubleshooting

**`Invalid environment configuration` on startup** — a required variable is missing from `.env`.
The message names the offending key.

**Dashboard shows "Could not load clients"** — the API is not running, or is not on port 4000.
Check `npm run dev` and `curl http://localhost:4000/api/health`.

**Dispatch returns `enqueued: 0`** — no opted-in client had stats inside the report window. Re-run
`npm run seed`, or pass an explicit `date` in the request body.

**Jobs queue but never send** — the worker is not running. It is a separate process from the API.

**Messages marked `failed` with a 404** — the webhook URL is wrong or has been revoked. Regenerate
it in the Slack app settings and save it again from the dashboard.

**Worker cannot reach Redis** — confirm the container is healthy with `docker compose ps`.
