import type { Request, RequestHandler } from 'express';
import { z } from 'zod';

import { AuthenticationError, ValidationError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/api-response.js';
import type { RazorpayDepositService } from './razorpay-deposit.service.js';

const amountSchema = z.string().regex(/^[1-9]\d*$/, 'Must be a positive integer string');
const orderBodySchema = z.object({
  amountMinor: amountSchema,
  description: z.string().trim().min(1).max(200).optional(),
});
const verificationBodySchema = z.object({
  localOrderId: z.uuid(),
  razorpayOrderId: z.string().min(1).max(100),
  razorpayPaymentId: z.string().min(1).max(100),
  razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
});
const idempotencyKeySchema = z.string().min(8).max(128);

export class RazorpayDepositHandler {
  public constructor(private readonly service: RazorpayDepositService) {}

  public readonly capabilities: RequestHandler = (request, response) => {
    sendSuccess(request, response, 200, this.service.capabilities());
  };

  public readonly createOrder: RequestHandler = async (request, response) => {
    const userId = this.requireUser(request);
    const input = orderBodySchema.parse(request.body);
    const result = await this.service.createOrder({
      userId,
      amountMinor: input.amountMinor,
      idempotencyKey: this.idempotencyKey(request),
      ...(input.description ? { description: input.description } : {}),
    });
    response.setHeader('Idempotent-Replayed', String(result.replayed));
    sendSuccess(request, response, result.replayed ? 200 : 201, result);
  };

  public readonly verify: RequestHandler = async (request, response) => {
    const userId = this.requireUser(request);
    this.idempotencyKey(request);
    const input = verificationBodySchema.parse(request.body);
    const result = await this.service.verifyCheckout({
      userId,
      localOrderId: input.localOrderId,
      providerOrderId: input.razorpayOrderId,
      providerPaymentId: input.razorpayPaymentId,
      providerSignature: input.razorpaySignature,
    });
    sendSuccess(request, response, 201, result);
  };

  public readonly webhook: RequestHandler = async (request, response) => {
    if (!Buffer.isBuffer(request.body)) {
      throw new ValidationError('Webhook requires a raw JSON body');
    }
    const signature = request.header('x-razorpay-signature');
    const eventId = request.header('x-razorpay-event-id');
    if (!signature || !eventId) {
      throw new AuthenticationError('Razorpay webhook signature headers are missing');
    }
    const result = await this.service.handleWebhook({
      rawBody: request.body,
      signature,
      eventId,
    });
    sendSuccess(request, response, 200, result);
  };

  private requireUser(request: Request): string {
    if (!request.auth?.userId) throw new AuthenticationError();
    return request.auth.userId;
  }

  private idempotencyKey(request: Request): string {
    return idempotencyKeySchema.parse(request.header('idempotency-key'));
  }
}
