import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

import { AuthenticationError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/api-response.js';
import type { IdempotentResult } from '../idempotency/idempotency.service.js';
import type { PaymentService } from './payment.service.js';

const amountSchema = z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer string');
const moneyBodySchema = z.object({
  amountMinor: amountSchema,
  description: z.string().trim().min(1).max(200).optional(),
});
const transferBodySchema = moneyBodySchema.extend({
  recipientEmail: z.email().max(254),
});
const idempotencyKeySchema = z.string().min(8).max(128);

export class PaymentHandler {
  public constructor(private readonly service: PaymentService) {}

  public readonly deposit: RequestHandler = async (request, response) => {
    const userId = this.requireUser(request);
    const input = moneyBodySchema.parse(request.body);
    const result = await this.service.deposit({
      userId,
      amountMinor: input.amountMinor,
      idempotencyKey: this.idempotencyKey(request),
      ...(input.description ? { description: input.description } : {}),
    });
    this.respond(request, response, result);
  };

  public readonly transfer: RequestHandler = async (request, response) => {
    const userId = this.requireUser(request);
    const input = transferBodySchema.parse(request.body);
    const result = await this.service.transfer({
      userId,
      recipientEmail: input.recipientEmail,
      amountMinor: input.amountMinor,
      idempotencyKey: this.idempotencyKey(request),
      ...(input.description ? { description: input.description } : {}),
    });
    this.respond(request, response, result);
  };

  public readonly withdraw: RequestHandler = async (request, response) => {
    const userId = this.requireUser(request);
    const input = moneyBodySchema.parse(request.body);
    const result = await this.service.withdraw({
      userId,
      amountMinor: input.amountMinor,
      idempotencyKey: this.idempotencyKey(request),
      ...(input.description ? { description: input.description } : {}),
    });
    this.respond(request, response, result);
  };

  private requireUser(request: Request): string {
    if (!request.auth?.userId) throw new AuthenticationError();
    return request.auth.userId;
  }

  private idempotencyKey(request: Request): string {
    return idempotencyKeySchema.parse(request.header('idempotency-key'));
  }

  private respond<T>(request: Request, response: Response, result: IdempotentResult<T>): void {
    response.setHeader('Idempotent-Replayed', String(result.replayed));
    sendSuccess(request, response, result.statusCode, result.body);
  }
}
