import type { RequestHandler } from 'express';
import { z } from 'zod';

import { AuthenticationError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/api-response.js';
import type { WalletService } from './wallet.service.js';

const statementQuerySchema = z.object({
  type: z.enum(['DEPOSIT', 'TRANSFER', 'WITHDRAWAL']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const analyticsQuerySchema = statementQuerySchema.pick({ from: true, to: true });

export class WalletHandler {
  public constructor(private readonly service: WalletService) {}

  public readonly getBalance: RequestHandler = async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId) throw new AuthenticationError();
    sendSuccess(request, response, 200, await this.service.getBalance(userId));
  };

  public readonly getStatement: RequestHandler = async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId) throw new AuthenticationError();
    const query = statementQuerySchema.parse(request.query);
    const filters = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      page: query.page,
      pageSize: query.pageSize,
    };
    sendSuccess(request, response, 200, await this.service.getStatement(userId, filters));
  };

  public readonly getAnalytics: RequestHandler = async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId) throw new AuthenticationError();
    const query = analyticsQuerySchema.parse(request.query);
    const range = {
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    };
    sendSuccess(request, response, 200, await this.service.getAnalytics(userId, range));
  };
}
