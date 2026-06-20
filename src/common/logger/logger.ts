import pino, { type Logger } from 'pino';

import type { Environment } from '../../config/environment.js';

export function createLogger(environment: Environment): Logger {
  const transport =
    environment.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:standard',
          },
        }
      : undefined;

  return pino({
    level: environment.LOG_LEVEL,
    base: {
      service: 'digital-wallet-api',
      environment: environment.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        '*.password',
        'refreshToken',
        '*.refreshToken',
        'token',
        '*.token',
        'RESEND_API_KEY',
        '*.RESEND_API_KEY',
      ],
      censor: '[REDACTED]',
    },
    ...(transport === undefined ? {} : { transport }),
  });
}
