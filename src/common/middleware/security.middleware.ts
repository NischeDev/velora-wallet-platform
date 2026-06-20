import cors from 'cors';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';

import type { Environment } from '../../config/environment.js';

export function createSecurityMiddleware(environment: Environment): RequestHandler[] {
  const allowedOrigins = new Set(
    environment.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  return [
    helmet({ contentSecurityPolicy: false }),
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) callback(null, true);
        else callback(new Error('Origin is not allowed by CORS'));
      },
    }),
  ];
}

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (request) => request.path.startsWith('/api/v1/health'),
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const moneyRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
