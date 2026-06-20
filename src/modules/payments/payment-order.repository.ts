import type { PoolClient } from 'pg';

import type { DatabasePool } from '../../infrastructure/database/postgres.js';

export interface PaymentOrderRow {
  id: string;
  user_id: string;
  provider: 'RAZORPAY';
  provider_order_id: string | null;
  provider_payment_id: string | null;
  idempotency_key: string;
  request_hash: string;
  amount: string;
  currency: string;
  status: 'CREATING' | 'CREATED' | 'CREDITED' | 'FAILED';
  description: string | null;
  ledger_transaction_id: string | null;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
  credited_at: Date | null;
}

export class PaymentOrderRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async createIntent(input: {
    userId: string;
    idempotencyKey: string;
    requestHash: string;
    amount: bigint;
    currency: string;
    description?: string;
  }): Promise<{ row: PaymentOrderRow; created: boolean }> {
    const result = await this.database.query<PaymentOrderRow>(
      `INSERT INTO payment_orders
         (user_id, provider, idempotency_key, request_hash, amount, currency, description)
       VALUES ($1, 'RAZORPAY', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING *`,
      [
        input.userId,
        input.idempotencyKey,
        input.requestHash,
        input.amount.toString(),
        input.currency,
        input.description ?? null,
      ],
    );
    if (result.rows[0]) return { row: result.rows[0], created: true };

    const existing = await this.findByUserAndIdempotencyKey(input.userId, input.idempotencyKey);
    if (!existing) throw new Error('Payment order idempotency conflict could not be resolved');
    return { row: existing, created: false };
  }

  public async findByUserAndIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentOrderRow | null> {
    const result = await this.database.query<PaymentOrderRow>(
      `SELECT * FROM payment_orders WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  public async markCreated(id: string, providerOrderId: string): Promise<PaymentOrderRow> {
    const result = await this.database.query<PaymentOrderRow>(
      `UPDATE payment_orders
       SET provider_order_id = $2, status = 'CREATED', updated_at = NOW()
       WHERE id = $1 AND status = 'CREATING'
       RETURNING *`,
      [id, providerOrderId],
    );
    if (!result.rows[0]) throw new Error('Payment order changed before provider creation');
    return result.rows[0];
  }

  public async markFailed(id: string, reason: string): Promise<void> {
    await this.database.query(
      `UPDATE payment_orders
       SET status = 'FAILED', failure_reason = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'CREATING'`,
      [id, reason.slice(0, 500)],
    );
  }

  public async findForUser(id: string, userId: string): Promise<PaymentOrderRow | null> {
    const result = await this.database.query<PaymentOrderRow>(
      `SELECT * FROM payment_orders WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  public async findByProviderOrderId(providerOrderId: string): Promise<PaymentOrderRow | null> {
    const result = await this.database.query<PaymentOrderRow>(
      `SELECT * FROM payment_orders WHERE provider_order_id = $1`,
      [providerOrderId],
    );
    return result.rows[0] ?? null;
  }

  public async lockById(client: PoolClient, id: string): Promise<PaymentOrderRow | null> {
    const result = await client.query<PaymentOrderRow>(
      `SELECT * FROM payment_orders WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  public async markCredited(
    client: PoolClient,
    input: { id: string; paymentId: string; transactionId: string },
  ): Promise<void> {
    await client.query(
      `UPDATE payment_orders
       SET provider_payment_id = $2,
           ledger_transaction_id = $3,
           status = 'CREDITED',
           credited_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'CREATED'`,
      [input.id, input.paymentId, input.transactionId],
    );
  }
}

export class ProviderWebhookRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async claim(input: {
    eventId: string;
    eventType: string;
    payloadHash: string;
  }): Promise<boolean> {
    const result = await this.database.query(
      `INSERT INTO provider_webhook_events
         (provider, provider_event_id, event_type, payload_hash)
       VALUES ('RAZORPAY', $1, $2, $3)
       ON CONFLICT (provider, provider_event_id) DO NOTHING`,
      [input.eventId, input.eventType, input.payloadHash],
    );
    return result.rowCount === 1;
  }

  public async complete(
    eventId: string,
    status: 'PROCESSED' | 'IGNORED' | 'FAILED',
    errorMessage?: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE provider_webhook_events
       SET status = $2, error_message = $3, processed_at = NOW()
       WHERE provider = 'RAZORPAY' AND provider_event_id = $1`,
      [eventId, status, errorMessage?.slice(0, 500) ?? null],
    );
  }
}
