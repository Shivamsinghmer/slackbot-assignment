import IORedis from 'ioredis';
import { env } from '../config/env.js';

/**
 * BullMQ requires maxRetriesPerRequest: null — otherwise ioredis aborts the
 * blocking BRPOPLPUSH the worker sits on while waiting for jobs.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}
