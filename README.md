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
- **Runtime configuration** — delivery target and mock behaviour are editable from the interface, so a
  deployed instance needs no redeploy to change them.

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
- Docker (for local Redis)
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
| `REDIS_URL` | `redis://localhost:6379` | Redis connection. A `rediss://` URL enables TLS, which managed providers require |
| `REDIS_DRAIN_DELAY_SECONDS` | `5` | How long the worker blocks waiting for a job. Raise to `60` on a metered Redis — see [Deploying](#deploying) |
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
| `RUN_WORKER_IN_PROCESS` | `false` | Run the worker inside the API process (single-service hosting) |
| `AUTO_SEED` | `false` | Seed demo data on first boot if the database is empty |
| `SLACK_WEBHOOK_1..5` | — | Webhook URLs used as seed data |

`USE_MOCK_SLACK`, `MOCK_429_RATE` and `MOCK_RETRY_AFTER_SECONDS` are **defaults only**. Once changed
in the dashboard they are stored in the `settings` collection, which takes precedence — see
[Deploying](#deploying).

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

## Deploying

The blueprint in `render.yaml` deploys the API and the dashboard on Render's free tier. Redis comes
from **Upstash** and MongoDB from **Atlas**, both free.

### One-time setup

1. Create a free **MongoDB Atlas** M0 cluster. Under Network Access allow `0.0.0.0/0` — Render's free
   tier has no static outbound IP. Copy the connection string.

2. Create a free **Upstash** Redis database.
   - Pick a region near your Render region to keep latency down.
   - Copy the **`rediss://` connection string** from the console — the one under *Redis Connect*, not
     the REST URL. BullMQ speaks the Redis wire protocol; the REST endpoint will not work.
   - Turn **eviction off**. BullMQ stores job state in Redis, and an evicted key is a lost job.

3. Push this repository to GitHub.

4. In Render: **New → Blueprint**, select the repository. It reads `render.yaml` and creates the API
   and the static site.

5. Render prompts for five values:

   | Prompt | Value |
   |---|---|
   | `MONGODB_URI` | Atlas connection string, including the database name |
   | `REDIS_URL` | Upstash `rediss://` connection string |
   | `API_BASE` | The API service's own URL, e.g. `https://report-dispatch-api.onrender.com` |
   | `CORS_ORIGIN` | The static site's URL, e.g. `https://report-dispatch-web.onrender.com` |
   | `VITE_API_BASE` | The API service's URL again — baked into the frontend at build time |

   The two Render URLs only exist after the first deploy, so fill them in and trigger a redeploy.
   Include the `https://` scheme; the API validates these and rejects a bare hostname.

6. Open the dashboard. It seeds itself with demo clients on first boot, so there is data immediately.

### Upstash and the command budget

Upstash bills per command, and **an idle BullMQ worker is not free**. The worker waits for jobs with a
blocking read that expires every `drainDelay` seconds, and each expiry costs one command. At BullMQ's
5-second default that is roughly 17,000 commands a day while doing nothing at all — more than the
free daily allowance on its own, before a single report is sent.

`REDIS_DRAIN_DELAY_SECONDS` controls this. The blueprint sets it to `60`, cutting idle traffic to
about 1,400 commands a day.

Raising it costs nothing in responsiveness: the blocking read returns the moment a job is pushed, so
it does not delay dispatches. Measured with the delay at 60 seconds, the first message left **132 ms**
after the dispatch request, with the usual one-second spacing after that.

Locally, against a Redis container where commands are free, the 5-second default is fine.

### Configuration after deployment

A deployed instance has no editable `.env`, so the things you would otherwise change there are
editable in the dashboard instead:

- **Webhook URLs** — per client, in the client settings panel.
- **Delivery target** — Live Slack or the mock endpoint, under Delivery settings.
- **Mock rejection rate and `Retry-After`** — sliders under Delivery settings, so rate-limit recovery
  can be demonstrated on the live URL without a redeploy.

Environment variables still supply the *defaults*; a value changed in the dashboard is stored in the
`settings` collection and takes precedence. **Reset** restores the deployed defaults.

The 1 message/second delivery rate is deliberately not editable. It is the guarantee the queue exists
to provide, and BullMQ fixes the limiter when the worker is constructed.

### What differs from local development

- **The worker shares the API process** (`RUN_WORKER_IN_PROCESS=true`). Render's free tier bills a
  separate Background Worker, so the two run together. The queue, the limiter and the 429 handling
  are identical — only the process boundary moves. Locally it stays a separate process so its logs
  are readable on their own.
- **The scheduler is off** (`ENABLE_CRON=false`). Free instances sleep after roughly 15 minutes of
  inactivity, so a 09:00 cron would not fire dependably. Dispatches are triggered from the dashboard.
- **The first request after idle is slow** — 30–60 seconds while the instance wakes. The dashboard
  shows "API unreachable" until it responds.
- **Redis is metered, not persistent-by-default.** Upstash's free tier has a daily command budget —
  see above — and job state lives only in Redis. Delivery history is in MongoDB and survives
  regardless.
- **Delivery defaults to the mock endpoint** (`USE_MOCK_SLACK=true`), so a public URL cannot post to
  Slack until someone switches it deliberately.

### A note on access

The dashboard has no authentication — it was built as an internal tool behind a network boundary.
On a public URL, anyone who finds it can change webhook URLs and trigger dispatches. Webhook URLs are
validated against `hooks.slack.com`, so it cannot be pointed at arbitrary hosts, but treat a deployed
instance as a demo rather than something to leave running with live webhooks configured.

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
| `GET` | `/api/settings` | Current runtime settings and the deployed defaults |
| `PUT` | `/api/settings` | Update delivery target or mock behaviour |
| `POST` | `/api/settings/reset` | Restore the deployed defaults |
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
settings            { _id: 'runtime', use_mock_slack, mock_429_rate,
                      mock_retry_after_seconds }
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
  services/settings.ts            Runtime settings (DB overrides env defaults)
  services/seedData.ts            Seed data, shared by the script and first boot
  scripts/seed.ts                 Seed CLI
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
