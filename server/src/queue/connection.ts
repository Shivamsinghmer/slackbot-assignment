import IORedis from 'ioredis';
import { env } from '../config/env.js';

/**
 * BullMQ requires maxRetriesPerRequest: null — otherwise ioredis aborts the
 * blocking read the worker sits on while waiting for jobs.
 *
 * Works against a local container and against a managed provider (Upstash,
 * Render Key Value). A `rediss://` URL turns on TLS, which every managed
 * provider requires.
 */
export function createRedisConnection(): IORedis {
  const secure = env.REDIS_URL.startsWith('rediss://');

  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Managed Redis sits behind a proxy that can drop an idle connection;
    // reconnecting silently is better than surfacing an error to the worker.
    retryStrategy: (times) => Math.min(times * 200, 5000),
    ...(secure ? { tls: {} } : {}),
  });
}
