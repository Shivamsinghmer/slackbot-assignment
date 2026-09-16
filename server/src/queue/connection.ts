import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

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

function isLocalRedis(url: string): boolean {
  return /\/\/(?:[^@]*@)?(?:localhost|127\.0\.0\.1|\[::1\]|redis)[:/]/.test(url);
}

/**
 * Proves Redis is actually reachable, and says so plainly in the logs.
 *
 * Without this a bad REDIS_URL shows up only as the queue endpoints hanging,
 * because BullMQ retries connection failures forever rather than surfacing
 * them. Worth the one round trip at boot.
 */
export async function verifyRedis(): Promise<boolean> {
  const started = Date.now();

  // Managed Redis (Upstash, Render Key Value, Redis Cloud) accepts only TLS.
  // Handing it a plaintext redis:// URL gets the socket reset on every attempt,
  // which surfaces as an ECONNRESET loop and endpoints that hang forever —
  // nothing that points at the one missing character.
  if (!env.REDIS_URL.startsWith('rediss://') && !isLocalRedis(env.REDIS_URL)) {
    logger.warn(
      'REDIS_URL uses redis:// against a remote host. Managed providers require TLS — ' +
        'the scheme almost certainly needs to be rediss:// (two s). Connecting anyway.',
    );
  }
  const redis = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 10_000,
    lazyConnect: true,
    ...(env.REDIS_URL.startsWith('rediss://') ? { tls: {} } : {}),
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    logger.info(
      { ms: Date.now() - started, tls: env.REDIS_URL.startsWith('rediss://') },
      `Redis reachable (${pong})`,
    );
    return true;
  } catch (err) {
    const host = env.REDIS_URL.replace(/\/\/[^@]*@/, '//***@');
    logger.error(
      { err: (err as Error).message, host, ms: Date.now() - started, node: process.version },
      'Redis UNREACHABLE — queue endpoints will hang until this is fixed',
    );
    return false;
  } finally {
    redis.disconnect();
  }
}
