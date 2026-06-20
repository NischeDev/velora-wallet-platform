import { createHash } from 'node:crypto';

import { z } from 'zod';

import { AppError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { parsePositiveMinorUnits } from '../../common/money/money.js';
import type { Environment } from '../../config/environment.js';
import type { DatabasePool } from '../../infrastructure/database/postgres.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import type { AccountRepository } from '../accounts/account.repository.js';
import type { LedgerRepository, TransactionRow } from '../ledger/ledger.repository.js';
import type {
  PaymentOrderRepository,
  ProviderWebhookRepository,
  PaymentOrderRow,
} from './payment-order.repository.js';
import type { RazorpayClient, RazorpayPayment } from './razorpay.client.js';
import { verifyWebhookSignature } from './razorpay.client.js';

const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    payment: z
      .object({
        entity: z.object({ id: z.string(), order_id: z.string().nullable() }),
      })
      .optional(),
  }),
});

interface TransactionResponse {
  transaction: {
    id: string;
    type: TransactionRow['type'];
    status: 'POSTED';
    amountMinor: string;
    currency: string;
    sourceAccountId: string;
    destinationAccountId: string;
    externalReference: string | null;
    description: string | null;
    createdAt: string;
  };
}

export class RazorpayDepositService {
  public constructor(
    private readonly database: DatabasePool,
    private readonly accounts: AccountRepository,
    private readonly ledger: LedgerRepository,
    private readonly orders: PaymentOrderRepository,
    private readonly webhookEvents: ProviderWebhookRepository,
    private readonly environment: Environment,
    private readonly client: RazorpayClient | null,
  ) {}

  public capabilities() {
    return {
      provider: this.client ? 'razorpay' : 'simulated',
      checkoutEnabled: this.client !== null,
      withdrawalsEnabled: true,
      withdrawalMode: 'local-simulation',
      currency: this.environment.DEFAULT_CURRENCY,
      mode: this.client ? 'test' : 'local-simulation',
    };
  }

  public async createOrder(input: {
    userId: string;
    amountMinor: string;
    idempotencyKey: string;
    description?: string;
  }) {
    const provider = this.requireClient();
    if (this.environment.DEFAULT_CURRENCY !== 'INR') {
      throw new AppError('Razorpay checkout requires an INR wallet', 409, 'INR_WALLET_REQUIRED');
    }
    const amount = parsePositiveMinorUnits(input.amountMinor);
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          amountMinor: amount.toString(),
          currency: this.environment.DEFAULT_CURRENCY,
          description: input.description ?? null,
        }),
      )
      .digest('hex');

    const intent = await this.orders.createIntent({
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestHash,
      amount,
      currency: this.environment.DEFAULT_CURRENCY,
      ...(input.description ? { description: input.description } : {}),
    });

    if (!intent.created) {
      if (intent.row.request_hash !== requestHash) {
        throw new ConflictError(
          'This Idempotency-Key was already used with a different request',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      if (intent.row.status === 'CREATED' || intent.row.status === 'CREDITED') {
        return this.formatCheckout(intent.row, provider.publicKeyId, true);
      }
      if (intent.row.status === 'CREATING') {
        throw new ConflictError(
          'The payment order is still being created',
          'PAYMENT_ORDER_PENDING',
        );
      }
      throw new AppError(
        'The previous provider order attempt failed; retry with a new Idempotency-Key',
        502,
        'PAYMENT_ORDER_FAILED',
      );
    }

    try {
      const order = await provider.createOrder({
        amount,
        currency: this.environment.DEFAULT_CURRENCY,
        receipt: `lp_${intent.row.id.replaceAll('-', '')}`,
        notes: { local_order_id: intent.row.id },
      });
      if (BigInt(order.amount) !== amount || order.currency !== this.environment.DEFAULT_CURRENCY) {
        throw new AppError('Provider returned mismatched order details', 502, 'PROVIDER_MISMATCH');
      }
      const created = await this.orders.markCreated(intent.row.id, order.id);
      return this.formatCheckout(created, provider.publicKeyId, false);
    } catch (error) {
      await this.orders.markFailed(
        intent.row.id,
        error instanceof Error ? error.message : 'Unknown provider error',
      );
      throw error;
    }
  }

  public async verifyCheckout(input: {
    userId: string;
    localOrderId: string;
    providerOrderId: string;
    providerPaymentId: string;
    providerSignature: string;
  }): Promise<TransactionResponse> {
    const provider = this.requireClient();
    const order = await this.orders.findForUser(input.localOrderId, input.userId);
    if (!order) throw new NotFoundError('Payment order was not found');
    if (order.provider_order_id !== input.providerOrderId) {
      throw new ConflictError('Payment order does not match', 'PAYMENT_ORDER_MISMATCH');
    }
    provider.verifyCheckoutSignature({
      orderId: order.provider_order_id,
      paymentId: input.providerPaymentId,
      signature: input.providerSignature,
    });
    return this.fetchAndFinalize(order, input.providerPaymentId);
  }

  public async handleWebhook(input: {
    rawBody: Buffer;
    signature: string;
    eventId: string;
  }): Promise<{ duplicate: boolean; processed: boolean }> {
    const webhookSecret = this.environment.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError(
        'Razorpay webhook secret is not configured',
        503,
        'WEBHOOK_NOT_CONFIGURED',
      );
    }
    verifyWebhookSignature(input.rawBody, input.signature, webhookSecret);
    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    const event = webhookSchema.parse(JSON.parse(input.rawBody.toString('utf8')) as unknown);
    const claimed = await this.webhookEvents.claim({
      eventId: input.eventId,
      eventType: event.event,
      payloadHash,
    });
    if (!claimed) return { duplicate: true, processed: true };

    if (!['payment.captured', 'order.paid'].includes(event.event)) {
      await this.webhookEvents.complete(input.eventId, 'IGNORED');
      return { duplicate: false, processed: false };
    }

    const payment = event.payload.payment?.entity;
    if (!payment?.order_id) {
      await this.webhookEvents.complete(input.eventId, 'IGNORED');
      return { duplicate: false, processed: false };
    }
    const order = await this.orders.findByProviderOrderId(payment.order_id);
    if (!order) {
      await this.webhookEvents.complete(input.eventId, 'IGNORED');
      return { duplicate: false, processed: false };
    }

    try {
      await this.fetchAndFinalize(order, payment.id);
      await this.webhookEvents.complete(input.eventId, 'PROCESSED');
      return { duplicate: false, processed: true };
    } catch (error) {
      await this.webhookEvents.complete(
        input.eventId,
        'FAILED',
        error instanceof Error ? error.message : 'Unknown webhook error',
      );
      throw error;
    }
  }

  private async fetchAndFinalize(
    order: PaymentOrderRow,
    paymentId: string,
  ): Promise<TransactionResponse> {
    const payment = await this.requireClient().fetchPayment(paymentId);
    this.assertCapturedPayment(order, payment);

    return withTransaction(this.database, async (client) => {
      const lockedOrder = await this.orders.lockById(client, order.id);
      if (!lockedOrder) throw new NotFoundError('Payment order was not found');
      if (lockedOrder.status === 'CREDITED') {
        const existing = await this.ledger.findTransactionById(
          client,
          lockedOrder.ledger_transaction_id!,
        );
        if (!existing)
          throw new AppError('Credited ledger transaction is missing', 500, 'LEDGER_MISSING');
        return this.formatTransaction(existing);
      }
      if (lockedOrder.status !== 'CREATED') {
        throw new ConflictError('Payment order cannot be credited', 'PAYMENT_ORDER_INVALID_STATE');
      }

      const wallet = await this.accounts.findWalletByUserId(
        lockedOrder.user_id,
        lockedOrder.currency.trim(),
        client,
      );
      const funding = await this.accounts.findSystemAccount(
        'EXTERNAL_FUNDING',
        lockedOrder.currency.trim(),
        client,
      );
      if (!wallet || !funding) {
        throw new AppError('An INR ledger account is missing', 500, 'LEDGER_ACCOUNT_MISSING');
      }
      const lockedAccounts = await this.accounts.lockAccounts(client, [wallet.id, funding.id]);
      if (lockedAccounts.length !== 2) {
        throw new AppError('An INR ledger account is missing', 500, 'LEDGER_ACCOUNT_MISSING');
      }

      const transaction = await this.ledger.createTransaction(client, {
        type: 'DEPOSIT',
        amount: BigInt(lockedOrder.amount),
        currency: lockedOrder.currency.trim(),
        sourceAccountId: funding.id,
        destinationAccountId: wallet.id,
        externalReference: payment.id,
        description: lockedOrder.description ?? 'Razorpay wallet deposit',
        metadata: {
          provider: 'RAZORPAY',
          providerOrderId: lockedOrder.provider_order_id,
          paymentMethod: payment.method ?? null,
          localPaymentOrderId: lockedOrder.id,
        },
      });
      await this.ledger.addBalancedEntries(client, {
        transactionId: transaction.id,
        debitAccountId: funding.id,
        creditAccountId: wallet.id,
        amount: BigInt(lockedOrder.amount),
        currency: lockedOrder.currency.trim(),
      });
      await this.orders.markCredited(client, {
        id: lockedOrder.id,
        paymentId: payment.id,
        transactionId: transaction.id,
      });
      return this.formatTransaction(transaction);
    });
  }

  private assertCapturedPayment(order: PaymentOrderRow, payment: RazorpayPayment): void {
    if (
      !payment.captured ||
      payment.status !== 'captured' ||
      payment.order_id !== order.provider_order_id ||
      BigInt(payment.amount) !== BigInt(order.amount) ||
      payment.currency !== order.currency.trim()
    ) {
      throw new ConflictError(
        'Razorpay payment is not captured or does not match this order',
        'PAYMENT_NOT_CAPTURED',
      );
    }
  }

  private formatCheckout(order: PaymentOrderRow, keyId: string, replayed: boolean) {
    return {
      localOrderId: order.id,
      providerOrderId: order.provider_order_id!,
      keyId,
      amountMinor: order.amount,
      currency: order.currency.trim(),
      brandName: 'Velora Demo',
      description: order.description ?? 'Add money to Velora',
      replayed,
    };
  }

  private formatTransaction(transaction: TransactionRow): TransactionResponse {
    return {
      transaction: {
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amountMinor: transaction.amount,
        currency: transaction.currency.trim(),
        sourceAccountId: transaction.source_account_id,
        destinationAccountId: transaction.destination_account_id,
        externalReference: transaction.external_reference,
        description: transaction.description,
        createdAt: transaction.created_at.toISOString(),
      },
    };
  }

  private requireClient(): RazorpayClient {
    if (!this.client) {
      throw new AppError(
        'Razorpay Test Mode is not configured; add test keys and set PAYMENT_PROVIDER=razorpay',
        503,
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
      );
    }
    return this.client;
  }
}
