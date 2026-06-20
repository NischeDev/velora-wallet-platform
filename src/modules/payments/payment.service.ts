import {
  AppError,
  ConflictError,
  InsufficientFundsError,
  NotFoundError,
} from '../../common/errors/app-error.js';
import { parsePositiveMinorUnits } from '../../common/money/money.js';
import type { Environment } from '../../config/environment.js';
import type { TransactionClient } from '../../infrastructure/database/transaction.js';
import type { AccountRepository, AccountRow } from '../accounts/account.repository.js';
import type { UserRepository } from '../auth/user.repository.js';
import type { IdempotencyService, IdempotentResult } from '../idempotency/idempotency.service.js';
import type { LedgerRepository, TransactionRow } from '../ledger/ledger.repository.js';
import type { PaymentProvider } from './payment-provider.js';

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

export class PaymentService {
  public constructor(
    private readonly accounts: AccountRepository,
    private readonly users: UserRepository,
    private readonly ledger: LedgerRepository,
    private readonly idempotency: IdempotencyService,
    private readonly provider: PaymentProvider,
    private readonly environment: Environment,
  ) {}

  public deposit(input: {
    userId: string;
    amountMinor: string;
    idempotencyKey: string;
    description?: string;
  }): Promise<IdempotentResult<TransactionResponse>> {
    if (this.environment.PAYMENT_PROVIDER === 'razorpay') {
      throw new AppError(
        'Use the Razorpay deposit-order flow when the provider is enabled',
        409,
        'RAZORPAY_CHECKOUT_REQUIRED',
      );
    }
    const amount = parsePositiveMinorUnits(input.amountMinor);
    return this.idempotency.execute({
      userId: input.userId,
      key: input.idempotencyKey,
      endpoint: 'POST:/wallet/deposits',
      request: { amountMinor: amount.toString(), description: input.description ?? null },
      operation: async (client) => {
        const providerResult = await this.provider.charge({
          userId: input.userId,
          amount,
          currency: this.environment.DEFAULT_CURRENCY,
          idempotencyKey: input.idempotencyKey,
        });
        const wallet = await this.requireWallet(input.userId, client);
        const funding = await this.requireSystemAccount('EXTERNAL_FUNDING', client);
        const transaction = await this.postMovement(client, {
          type: 'DEPOSIT',
          amount,
          debitAccount: funding,
          creditAccount: wallet,
          externalReference: providerResult.providerReference,
          description: input.description ?? 'Wallet deposit',
        });
        return { statusCode: 201, body: this.format(transaction) };
      },
    });
  }

  public transfer(input: {
    userId: string;
    recipientEmail: string;
    amountMinor: string;
    idempotencyKey: string;
    description?: string;
  }): Promise<IdempotentResult<TransactionResponse>> {
    const amount = parsePositiveMinorUnits(input.amountMinor);
    const recipientEmail = input.recipientEmail.trim().toLowerCase();

    return this.idempotency.execute({
      userId: input.userId,
      key: input.idempotencyKey,
      endpoint: 'POST:/wallet/transfers',
      request: {
        recipientEmail,
        amountMinor: amount.toString(),
        description: input.description ?? null,
      },
      operation: async (client) => {
        const recipient = await this.users.findByEmail(recipientEmail, client);
        if (!recipient || recipient.status !== 'ACTIVE')
          throw new NotFoundError('Recipient was not found');
        if (recipient.id === input.userId) {
          throw new ConflictError('A wallet cannot transfer money to itself', 'SELF_TRANSFER');
        }

        const senderWallet = await this.requireWallet(input.userId, client);
        const recipientWallet = await this.requireWallet(recipient.id, client);
        const transaction = await this.postMovement(client, {
          type: 'TRANSFER',
          amount,
          debitAccount: senderWallet,
          creditAccount: recipientWallet,
          requireFunds: true,
          description: input.description ?? 'P2P transfer',
          metadata: { senderUserId: input.userId, recipientUserId: recipient.id },
        });
        return { statusCode: 201, body: this.format(transaction) };
      },
    });
  }

  public withdraw(input: {
    userId: string;
    amountMinor: string;
    idempotencyKey: string;
    description?: string;
  }): Promise<IdempotentResult<TransactionResponse>> {
    const amount = parsePositiveMinorUnits(input.amountMinor);
    return this.idempotency.execute({
      userId: input.userId,
      key: input.idempotencyKey,
      endpoint: 'POST:/wallet/withdrawals',
      request: { amountMinor: amount.toString(), description: input.description ?? null },
      operation: async (client) => {
        const wallet = await this.requireWallet(input.userId, client);
        const clearing = await this.requireSystemAccount('WITHDRAWAL_CLEARING', client);
        const locked = await this.lockPair(client, wallet.id, clearing.id);
        const lockedWallet = locked.get(wallet.id)!;
        await this.assertSpendableBalance(client, lockedWallet, amount);

        const providerResult = await this.provider.payout({
          userId: input.userId,
          amount,
          currency: this.environment.DEFAULT_CURRENCY,
          idempotencyKey: input.idempotencyKey,
        });
        const transaction = await this.createMovement(client, {
          type: 'WITHDRAWAL',
          amount,
          debitAccount: lockedWallet,
          creditAccount: locked.get(clearing.id)!,
          externalReference: providerResult.providerReference,
          description: input.description ?? 'Wallet withdrawal',
        });
        return { statusCode: 201, body: this.format(transaction) };
      },
    });
  }

  private async postMovement(
    client: TransactionClient,
    input: {
      type: TransactionRow['type'];
      amount: bigint;
      debitAccount: AccountRow;
      creditAccount: AccountRow;
      requireFunds?: boolean;
      externalReference?: string;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TransactionRow> {
    const locked = await this.lockPair(client, input.debitAccount.id, input.creditAccount.id);
    const debit = locked.get(input.debitAccount.id)!;
    if (input.requireFunds) await this.assertSpendableBalance(client, debit, input.amount);
    return this.createMovement(client, {
      ...input,
      debitAccount: debit,
      creditAccount: locked.get(input.creditAccount.id)!,
    });
  }

  private async createMovement(
    client: TransactionClient,
    input: {
      type: TransactionRow['type'];
      amount: bigint;
      debitAccount: AccountRow;
      creditAccount: AccountRow;
      externalReference?: string;
      description: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TransactionRow> {
    const transaction = await this.ledger.createTransaction(client, {
      type: input.type,
      amount: input.amount,
      currency: this.environment.DEFAULT_CURRENCY,
      sourceAccountId: input.debitAccount.id,
      destinationAccountId: input.creditAccount.id,
      description: input.description,
      ...(input.externalReference ? { externalReference: input.externalReference } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    await this.ledger.addBalancedEntries(client, {
      transactionId: transaction.id,
      debitAccountId: input.debitAccount.id,
      creditAccountId: input.creditAccount.id,
      amount: input.amount,
      currency: this.environment.DEFAULT_CURRENCY,
    });
    return transaction;
  }

  private async lockPair(
    client: TransactionClient,
    firstId: string,
    secondId: string,
  ): Promise<Map<string, AccountRow>> {
    const rows = await this.accounts.lockAccounts(client, [firstId, secondId]);
    if (rows.length !== 2)
      throw new AppError('A ledger account is missing', 500, 'LEDGER_ACCOUNT_MISSING');
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async requireWallet(userId: string, client: TransactionClient): Promise<AccountRow> {
    const account = await this.accounts.findWalletByUserId(
      userId,
      this.environment.DEFAULT_CURRENCY,
      client,
    );
    if (!account) throw new AppError('Wallet account is missing', 500, 'WALLET_MISSING');
    return account;
  }

  private async requireSystemAccount(code: string, client: TransactionClient): Promise<AccountRow> {
    const account = await this.accounts.findSystemAccount(
      code,
      this.environment.DEFAULT_CURRENCY,
      client,
    );
    if (!account)
      throw new AppError('System ledger account is missing', 500, 'SYSTEM_ACCOUNT_MISSING');
    return account;
  }

  private async assertSpendableBalance(
    client: TransactionClient,
    account: AccountRow,
    amount: bigint,
  ): Promise<void> {
    const ledgerBalance = await this.accounts.getLedgerBalance(account.id, client);
    if (ledgerBalance !== account.balance) {
      throw new AppError(
        'The cached balance does not match the ledger',
        500,
        'LEDGER_BALANCE_MISMATCH',
      );
    }
    if (BigInt(ledgerBalance) < amount) throw new InsufficientFundsError();
  }

  private format(transaction: TransactionRow): TransactionResponse {
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
}
