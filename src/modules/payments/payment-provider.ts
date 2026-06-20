import { createHash } from 'node:crypto';

export interface PaymentProvider {
  charge(input: {
    userId: string;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
  }): Promise<{
    providerReference: string;
  }>;
  payout(input: {
    userId: string;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
  }): Promise<{
    providerReference: string;
  }>;
}

export class SimulatedPaymentProvider implements PaymentProvider {
  public charge(input: {
    userId: string;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerReference: string }> {
    return Promise.resolve({ providerReference: this.reference('charge', input) });
  }

  public payout(input: {
    userId: string;
    amount: bigint;
    currency: string;
    idempotencyKey: string;
  }): Promise<{ providerReference: string }> {
    return Promise.resolve({ providerReference: this.reference('payout', input) });
  }

  private reference(
    operation: string,
    input: { userId: string; amount: bigint; currency: string; idempotencyKey: string },
  ): string {
    const digest = createHash('sha256')
      .update(
        `${operation}:${input.userId}:${input.amount}:${input.currency}:${input.idempotencyKey}`,
      )
      .digest('hex')
      .slice(0, 24);
    return `sim_${operation}_${digest}`;
  }
}
