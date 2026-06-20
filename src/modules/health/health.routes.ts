import { Router } from 'express';

import type { HealthHandler } from './health.handler.js';

export function createHealthRouter(handler: HealthHandler): Router {
  const router = Router();

  router.get('/live', handler.liveness);
  router.get('/ready', handler.readiness);

  return router;
}
