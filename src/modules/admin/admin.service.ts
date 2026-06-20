import { NotFoundError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/environment.js';
import type {
  AdminRepository,
  AuditTrailRow,
  LedgerExplorerRow,
  TransactionEntryRow,
} from './admin.repository.js';

export class AdminService {
  public constructor(
    private readonly repository: AdminRepository,
    private readonly environment: Environment,
  ) {}

  public async getOverview() {
    const row = await this.repository.getOverview(this.environment.DEFAULT_CURRENCY);
    const paymentAttempts = Number(row.credited_payment_orders) + Number(row.failed_transactions);
    return {
      currency: this.environment.DEFAULT_CURRENCY,
      totalUsers: Number(row.total_users),
      adminUsers: Number(row.admin_users),
      totalWallets: Number(row.total_wallets),
      totalVolumeMinor: row.total_volume,
      totalDepositsMinor: row.total_deposits,
      totalWithdrawalsMinor: row.total_withdrawals,
      failedTransactions: Number(row.failed_transactions),
      pendingPaymentOrders: Number(row.pending_payment_orders),
      unbalancedTransactions: Number(row.unbalanced_transactions),
      paymentSuccessRate:
        paymentAttempts === 0
          ? null
          : Math.round((Number(row.credited_payment_orders) / paymentAttempts) * 10_000) / 100,
      generatedAt: new Date().toISOString(),
    };
  }

  public async getVolume(days: number) {
    const rows = await this.repository.getVolume(days, this.environment.DEFAULT_CURRENCY);
    return {
      currency: this.environment.DEFAULT_CURRENCY,
      days,
      points: rows.map((row) => ({
        date: row.date,
        depositsMinor: row.deposits,
        transfersMinor: row.transfers,
        withdrawalsMinor: row.withdrawals,
        transactionCount: Number(row.transaction_count),
      })),
    };
  }

  public async listLedger(page: number, pageSize: number) {
    const result = await this.repository.listLedger({ page, pageSize });
    return {
      transactions: result.rows.map((row) => this.formatLedgerRow(row)),
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  public async listAuditTrail(limit: number) {
    const rows = await this.repository.listAuditTrail(limit);
    return { events: rows.map((row) => this.formatAuditEvent(row)) };
  }

  public async getTransaction(transactionId: string) {
    const [transaction, entries] = await Promise.all([
      this.repository.findTransaction(transactionId),
      this.repository.listTransactionEntries(transactionId),
    ]);
    if (!transaction) throw new NotFoundError('Ledger transaction was not found');

    const sum = entries.reduce((total, entry) => total + BigInt(entry.amount), 0n);
    return {
      ...this.formatLedgerRow(transaction),
      externalReference: transaction.external_reference,
      displayId: displayTransactionId(transaction.id),
      entries: entries.map((entry) => this.formatEntry(entry)),
      balanced: entries.length >= 2 && sum === 0n,
      entrySumMinor: sum.toString(),
    };
  }

  private formatLedgerRow(row: LedgerExplorerRow) {
    return {
      id: row.id,
      displayId: displayTransactionId(row.id),
      type: row.type,
      status: row.status,
      amountMinor: row.amount,
      currency: row.currency,
      description: row.description,
      debitAccount: { id: row.debit_account_id, label: row.debit_account_label },
      creditAccount: { id: row.credit_account_id, label: row.credit_account_label },
      createdAt: row.created_at.toISOString(),
    };
  }

  private formatEntry(entry: TransactionEntryRow) {
    return {
      id: entry.id,
      accountId: entry.account_id,
      accountLabel: entry.account_label,
      accountType: entry.account_type,
      entryType: entry.entry_type,
      amountMinor: entry.amount,
      currency: entry.currency,
      createdAt: entry.created_at.toISOString(),
    };
  }

  private formatAuditEvent(row: AuditTrailRow) {
    const source = row.source_user_name ?? row.source_user_email ?? 'System';
    const destination = row.destination_user_name ?? row.destination_user_email ?? 'System';
    const narrative =
      row.type === 'DEPOSIT'
        ? `${destination} deposited funds`
        : row.type === 'TRANSFER'
          ? `${source} sent funds to ${destination}`
          : `${source} withdrew funds`;

    return {
      id: row.id,
      displayId: displayTransactionId(row.id),
      type: row.type,
      narrative,
      actor: row.type === 'DEPOSIT' ? destination : source,
      counterparty: row.type === 'TRANSFER' ? destination : null,
      amountMinor: row.amount,
      currency: row.currency,
      description: row.description,
      createdAt: row.created_at.toISOString(),
    };
  }
}

export function displayTransactionId(transactionId: string): string {
  return `TXN_${transactionId.replaceAll('-', '').slice(-8).toUpperCase()}`;
}
