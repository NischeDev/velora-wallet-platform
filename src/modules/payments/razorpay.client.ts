import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { AppError, AuthenticationError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/environment.js';

const orderSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.string(),
});

const paymentSchema = z.object({
  id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.string(),
  captured: z.boolean(),
  method: z.string().nullable().optional(),
});

export type RazorpayPayment = z.infer<typeof paymentSchema>;

export class RazorpayClient {
  public constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly apiUrl: string,
    private readonly timeoutMs: number,
  ) {}

  public get publicKeyId(): string {
    return this.keyId;
  }

  public async createOrder(input: {
    amount: bigint;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }) {
    const payload = await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: bigintToSafeProviderInteger(input.amount),
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes,
      }),
    });
    return orderSchema.parse(payload);
  }

  public async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    const payload = await this.request(`/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
    });
    return paymentSchema.parse(payload);
  }

  public verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): void {
    verifyHmac(`${input.orderId}|${input.paymentId}`, input.signature, this.keySecret);
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new AppError(
        'The payment provider is temporarily unavailable',
        502,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        error instanceof Error ? { reason: error.name } : undefined,
      );
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AppError(
        'Razorpay rejected the payment request',
        502,
        'PAYMENT_PROVIDER_REJECTED',
        { providerStatus: response.status },
      );
    }
    return payload;
  }
}

export function createRazorpayClient(environment: Environment): RazorpayClient | null {
  if (environment.PAYMENT_PROVIDER !== 'razorpay') return null;
  if (!environment.RAZORPAY_KEY_ID || !environment.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay Test Mode keys are required when PAYMENT_PROVIDER=razorpay');
  }
  return new RazorpayClient(
    environment.RAZORPAY_KEY_ID,
    environment.RAZORPAY_KEY_SECRET,
    environment.RAZORPAY_API_URL,
    environment.RAZORPAY_TIMEOUT_MS,
  );
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): void {
  verifyHmac(rawBody, signature, secret);
}

function verifyHmac(message: string | Buffer, receivedSignature: string, secret: string): void {
  const expected = createHmac('sha256', secret).update(message).digest();
  let received: Buffer;
  try {
    received = Buffer.from(receivedSignature, 'hex');
  } catch {
    throw new AuthenticationError('Payment signature is invalid');
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AuthenticationError('Payment signature is invalid');
  }
}

function bigintToSafeProviderInteger(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AppError('Payment amount exceeds provider limits', 400, 'AMOUNT_TOO_LARGE');
  }
  return Number(value);
}
