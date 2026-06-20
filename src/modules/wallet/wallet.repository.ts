import type { DatabasePool } from '../../infrastructure/database/postgres.js';

export interface StatementRow {
  id: string;
  type: 'DEPOSIT' | 'TRANSFER' | 'WITHDRAWAL';
  status: 'POSTED';
  amount: string;
  impact: string;
  currency: string;
  description: string | null;
  external_reference: string | null;
  counterparty: string | null;
  created_at: Date;
}

export interface StatementFilters {
  type?: StatementRow['type'];
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export class WalletRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async listTransactions(
    accountId: string,
    filters: StatementFilters,
  ): Promise<{ rows: StatementRow[]; total: number }> {
    const conditions = ['e.account_id = $1'];
    const values: unknown[] = [accountId];

    if (filters.type) {
      values.push(filters.type);
      conditions.push(`t.type = $${values.length}`);
    }
    if (filters.from) {
      values.push(filters.from);
      conditions.push(`t.created_at >= $${values.length}`);
    }
    if (filters.to) {
      values.push(filters.to);
      conditions.push(`t.created_at <= $${values.length}`);
    }

    const where = conditions.join(' AND ');
    const countResult = await this.database.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM entries e
       JOIN transactions t ON t.id = e.transaction_id
       WHERE ${where}`,
      values,
    );

    values.push(filters.pageSize);
    const limitParameter = `$${values.length}`;
    values.push((filters.page - 1) * filters.pageSize);
    const offsetParameter = `$${values.length}`;

    const result = await this.database.query<StatementRow>(
      `SELECT
         t.id, t.type, t.status, t.amount::text, e.amount::text AS impact,
         t.currency, t.description, t.external_reference, t.created_at,
         COALESCE(counterparty_user.email, counterparty_account.system_code) AS counterparty
       FROM entries e
       JOIN transactions t ON t.id = e.transaction_id
       JOIN entries counterparty_entry
         ON counterparty_entry.transaction_id = t.id
        AND counterparty_entry.account_id <> e.account_id
       JOIN accounts counterparty_account ON counterparty_account.id = counterparty_entry.account_id
       LEFT JOIN users counterparty_user ON counterparty_user.id = counterparty_account.user_id
       WHERE ${where}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      values,
    );

    return { rows: result.rows, total: Number(countResult.rows[0]!.total) };
  }

  public async getAnalytics(
    accountId: string,
    range: { from?: Date; to?: Date },
  ): Promise<{
    transaction_count: string;
    total_credits: string;
    total_debits: string;
    deposits: string;
    withdrawals: string;
    transfers_received: string;
    transfers_sent: string;
  }> {
    const conditions = ['e.account_id = $1'];
    const values: unknown[] = [accountId];
    if (range.from) {
      values.push(range.from);
      conditions.push(`t.created_at >= $${values.length}`);
    }
    if (range.to) {
      values.push(range.to);
      conditions.push(`t.created_at <= $${values.length}`);
    }

    const result = await this.database.query<{
      transaction_count: string;
      total_credits: string;
      total_debits: string;
      deposits: string;
      withdrawals: string;
      transfers_received: string;
      transfers_sent: string;
    }>(
      `SELECT
         COUNT(*)::text AS transaction_count,
         COALESCE(SUM(CASE WHEN e.amount > 0 THEN e.amount ELSE 0 END), 0)::bigint::text AS total_credits,
         COALESCE(SUM(CASE WHEN e.amount < 0 THEN -e.amount ELSE 0 END), 0)::bigint::text AS total_debits,
         COALESCE(SUM(CASE WHEN t.type = 'DEPOSIT' THEN e.amount ELSE 0 END), 0)::bigint::text AS deposits,
         COALESCE(SUM(CASE WHEN t.type = 'WITHDRAWAL' THEN -e.amount ELSE 0 END), 0)::bigint::text AS withdrawals,
         COALESCE(SUM(CASE WHEN t.type = 'TRANSFER' AND e.amount > 0 THEN e.amount ELSE 0 END), 0)::bigint::text AS transfers_received,
         COALESCE(SUM(CASE WHEN t.type = 'TRANSFER' AND e.amount < 0 THEN -e.amount ELSE 0 END), 0)::bigint::text AS transfers_sent
       FROM entries e
       JOIN transactions t ON t.id = e.transaction_id
       WHERE ${conditions.join(' AND ')}`,
      values,
    );
    return result.rows[0]!;
  }
}
