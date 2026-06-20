import { Router, type RequestHandler } from 'express';

import type { AuthHandler } from './auth.handler.js';

export function createAuthRouter(handler: AuthHandler, authRateLimit: RequestHandler): Router {
  const router = Router();
  router.post('/signup', authRateLimit, handler.signup);
  router.post('/login', authRateLimit, handler.login);
  router.post('/refresh', authRateLimit, handler.refresh);
  router.post('/logout', handler.logout);
  return router;
}
