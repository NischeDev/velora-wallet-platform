import { AppError, ValidationError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/environment.js';
import type { AccountRepository } from '../accounts/account.repository.js';
import type { StatementFilters, WalletRepository } from './wallet.repository.js';

export class WalletService {
  public constructor(
    private readonly accounts: AccountRepository,
    private readonly wallets: WalletRepository,
    private readonly environment: Environment,
  ) {}

  public async getBalance(userId: string): Promise<{
    walletId: string;
    currency: string;
    balanceMinor: string;
    cachedBalanceMinor: string;
  }> {
    const wallet = await this.accounts.findWalletByUserId(
      userId,
      this.environment.DEFAULT_CURRENCY,
    );
    if (!wallet) throw new AppError('Wallet account is missing', 500, 'WALLET_MISSING');

    const ledgerBalance = await this.accounts.getLedgerBalance(wallet.id);
    if (ledgerBalance !== wallet.balance) {
      throw new AppError(
        'The cached balance does not match the ledger',
        500,
        'LEDGER_BALANCE_MISMATCH',
      );
    }

    return {
      walletId: wallet.id,
      currency: wallet.currency.trim(),
      balanceMinor: ledgerBalance,
      cachedBalanceMinor: wallet.balance,
    };
  }

  public async getStatement(userId: string, filters: StatementFilters) {
    this.validateRange(filters);
    const wallet = await this.accounts.findWalletByUserId(
      userId,
      this.environment.DEFAULT_CURRENCY,
    );
    if (!wallet) throw new AppError('Wallet account is missing', 500, 'WALLET_MISSING');

    const result = await this.wallets.listTransactions(wallet.id, filters);
    return {
      transactions: result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        amountMinor: row.amount,
        impactMinor: row.impact,
        currency: row.currency.trim(),
        description: row.description,
        externalReference: row.external_reference,
        counterparty: row.counterparty,
        createdAt: row.created_at.toISOString(),
      })),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / filters.pageSize),
      },
    };
  }

  public async getAnalytics(userId: string, range: { from?: Date; to?: Date }) {
    this.validateRange(range);
    const wallet = await this.accounts.findWalletByUserId(
      userId,
      this.environment.DEFAULT_CURRENCY,
    );
    if (!wallet) throw new AppError('Wallet account is missing', 500, 'WALLET_MISSING');
    const row = await this.wallets.getAnalytics(wallet.id, range);
    return {
      currency: wallet.currency.trim(),
      transactionCount: Number(row.transaction_count),
      totalCreditsMinor: row.total_credits,
      totalDebitsMinor: row.total_debits,
      depositsMinor: row.deposits,
      withdrawalsMinor: row.withdrawals,
      transfersReceivedMinor: row.transfers_received,
      transfersSentMinor: row.transfers_sent,
      range: {
        from: range.from?.toISOString() ?? null,
        to: range.to?.toISOString() ?? null,
      },
    };
  }

  private validateRange(range: { from?: Date; to?: Date }): void {
    if (range.from && range.to && range.from > range.to) {
      throw new ValidationError('from must be earlier than or equal to to');
    }
  }
}
