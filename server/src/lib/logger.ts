import pino from 'pino';
import { env } from '../config/env.js';

const pretty = env.NODE_ENV !== 'production';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: undefined, // drop pid/hostname — keeps the worker terminal readable during the demo
  ...(pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            messageFormat: '{msg}',
          },
        },
      }
    : {}),
});

export const apiLog = logger.child({ proc: 'api' });
export const workerLog = logger.child({ proc: 'worker' });
