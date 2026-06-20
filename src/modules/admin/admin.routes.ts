import { Router, type RequestHandler } from 'express';

import type { AdminHandler } from './admin.handler.js';

export function createAdminRouter(input: {
  auth: RequestHandler;
  requireAdmin: RequestHandler;
  handler: AdminHandler;
}): Router {
  const router = Router();
  router.use(input.auth, input.requireAdmin);
  router.get('/overview', input.handler.overview);
  router.get('/volume', input.handler.volume);
  router.get('/ledger', input.handler.ledger);
  router.get('/audit-trail', input.handler.auditTrail);
  router.get('/transactions/:id', input.handler.transactionDetail);
  return router;
}
