import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sendSuccess } from '../../common/http/api-response.js';
import type { AdminService } from './admin.service.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

const volumeQuerySchema = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .default(30),
});

const transactionParamsSchema = z.object({ id: z.uuid() });

export class AdminHandler {
  public constructor(private readonly service: AdminService) {}

  public readonly overview: RequestHandler = async (request, response) => {
    sendSuccess(request, response, 200, await this.service.getOverview());
  };

  public readonly ledger: RequestHandler = async (request, response) => {
    const query = paginationSchema.parse(request.query);
    sendSuccess(request, response, 200, await this.service.listLedger(query.page, query.pageSize));
  };

  public readonly volume: RequestHandler = async (request, response) => {
    const query = volumeQuerySchema.parse(request.query);
    sendSuccess(request, response, 200, await this.service.getVolume(query.days));
  };

  public readonly auditTrail: RequestHandler = async (request, response) => {
    const query = auditQuerySchema.parse(request.query);
    sendSuccess(request, response, 200, await this.service.listAuditTrail(query.limit));
  };

  public readonly transactionDetail: RequestHandler = async (request, response) => {
    const { id } = transactionParamsSchema.parse(request.params);
    sendSuccess(request, response, 200, await this.service.getTransaction(id));
  };
}
