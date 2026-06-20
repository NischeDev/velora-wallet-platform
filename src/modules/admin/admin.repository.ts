import type { DatabasePool } from '../../infrastructure/database/postgres.js';

export interface AdminOverviewRow {
  total_users: string;
  admin_users: string;
  total_wallets: string;
  total_volume: string;
  total_deposits: string;
  total_withdrawals: string;
  failed_transactions: string;
  pending_payment_orders: string;
  credited_payment_orders: string;
  unbalanced_transactions: string;
}

export interface AdminVolumeRow {
  date: string;
  deposits: string;
  transfers: string;
  withdrawals: string;
  transaction_count: string;
}

export interface LedgerExplorerRow {
  id: string;
  type: 'DEPOSIT' | 'TRANSFER' | 'WITHDRAWAL';
  status: 'POSTED';
  amount: string;
  currency: string;
  description: string | null;
  created_at: Date;
  debit_account_id: string;
  debit_account_label: string;
  credit_account_id: string;
  credit_account_label: string;
}

export interface AuditTrailRow {
  id: string;
  type: LedgerExplorerRow['type'];
  amount: string;
  currency: string;
  description: string | null;
  created_at: Date;
  source_user_name: string | null;
  source_user_email: string | null;
  destination_user_name: string | null;
  destination_user_email: string | null;
}

export interface TransactionDetailRow extends LedgerExplorerRow {
  external_reference: string | null;
}

export interface TransactionEntryRow {
  id: string;
  account_id: string;
  account_label: string;
  account_type: 'WALLET' | 'SYSTEM';
  entry_type: 'DEBIT' | 'CREDIT';
  amount: string;
  currency: string;
  created_at: Date;
}

export class AdminRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async getOverview(currency: string): Promise<AdminOverviewRow> {
    const result = await this.database.query<AdminOverviewRow>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE')::text AS total_users,
         (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE' AND role = 'ADMIN')::text AS admin_users,
         (SELECT COUNT(*) FROM accounts WHERE account_type = 'WALLET' AND currency = $1)::text AS total_wallets,
         COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'POSTED' AND currency = $1), 0)::text AS total_volume,
         COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'DEPOSIT' AND status = 'POSTED' AND currency = $1), 0)::text AS total_deposits,
         COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'POSTED' AND currency = $1), 0)::text AS total_withdrawals,
         COALESCE((SELECT COUNT(*) FROM payment_orders WHERE status = 'FAILED' AND currency = $1), 0)::text AS failed_transactions,
         COALESCE((SELECT COUNT(*) FROM payment_orders WHERE status = 'CREATED' AND currency = $1), 0)::text AS pending_payment_orders,
         COALESCE((SELECT COUNT(*) FROM payment_orders WHERE status = 'CREDITED' AND currency = $1), 0)::text AS credited_payment_orders,
         COALESCE((
           SELECT COUNT(*) FROM (
             SELECT transaction_id
             FROM entries
             JOIN transactions ON transactions.id = entries.transaction_id
             WHERE transactions.currency = $1
             GROUP BY entries.transaction_id
             HAVING SUM(entries.amount) <> 0 OR COUNT(*) < 2
           ) unbalanced
         ), 0)::text AS unbalanced_transactions`,
      [currency],
    );
    return result.rows[0]!;
  }

  public async getVolume(days: number, currency: string): Promise<AdminVolumeRow[]> {
    const result = await this.database.query<AdminVolumeRow>(
      `WITH dates AS (
         SELECT generate_series(
           CURRENT_DATE - ($1::integer - 1),
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date AS date
       ), daily AS (
         SELECT
           created_at::date AS date,
           COALESCE(SUM(amount) FILTER (WHERE type = 'DEPOSIT'), 0) AS deposits,
           COALESCE(SUM(amount) FILTER (WHERE type = 'TRANSFER'), 0) AS transfers,
           COALESCE(SUM(amount) FILTER (WHERE type = 'WITHDRAWAL'), 0) AS withdrawals,
           COUNT(*) AS transaction_count
         FROM transactions
         WHERE created_at >= CURRENT_DATE - ($1::integer - 1)
           AND currency = $2
         GROUP BY created_at::date
       )
       SELECT
         dates.date::text,
         COALESCE(daily.deposits, 0)::text AS deposits,
         COALESCE(daily.transfers, 0)::text AS transfers,
         COALESCE(daily.withdrawals, 0)::text AS withdrawals,
         COALESCE(daily.transaction_count, 0)::text AS transaction_count
       FROM dates
       LEFT JOIN daily USING (date)
       ORDER BY dates.date`,
      [days, currency],
    );
    return result.rows;
  }

  public async listLedger(input: {
    page: number;
    pageSize: number;
  }): Promise<{ rows: LedgerExplorerRow[]; total: number }> {
    const [countResult, rowsResult] = await Promise.all([
      this.database.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM transactions'),
      this.database.query<LedgerExplorerRow>(
        `SELECT
           t.id, t.type, t.status, t.amount::text, t.currency, t.description, t.created_at,
           debit_account.id AS debit_account_id,
           CASE
             WHEN debit_account.account_type = 'SYSTEM' THEN 'System / ' || debit_account.system_code
             ELSE COALESCE(debit_user.full_name, debit_user.email) || ' / ' || LEFT(debit_account.id::text, 8)
           END AS debit_account_label,
           credit_account.id AS credit_account_id,
           CASE
             WHEN credit_account.account_type = 'SYSTEM' THEN 'System / ' || credit_account.system_code
             ELSE COALESCE(credit_user.full_name, credit_user.email) || ' / ' || LEFT(credit_account.id::text, 8)
           END AS credit_account_label
         FROM transactions t
         JOIN entries debit_entry
           ON debit_entry.transaction_id = t.id AND debit_entry.entry_type = 'DEBIT'
         JOIN accounts debit_account ON debit_account.id = debit_entry.account_id
         LEFT JOIN users debit_user ON debit_user.id = debit_account.user_id
         JOIN entries credit_entry
           ON credit_entry.transaction_id = t.id AND credit_entry.entry_type = 'CREDIT'
         JOIN accounts credit_account ON credit_account.id = credit_entry.account_id
         LEFT JOIN users credit_user ON credit_user.id = credit_account.user_id
         ORDER BY t.created_at DESC, t.id DESC
         LIMIT $1 OFFSET $2`,
        [input.pageSize, (input.page - 1) * input.pageSize],
      ),
    ]);

    return { rows: rowsResult.rows, total: Number(countResult.rows[0]!.total) };
  }

  public async listAuditTrail(limit: number): Promise<AuditTrailRow[]> {
    const result = await this.database.query<AuditTrailRow>(
      `SELECT
         t.id, t.type, t.amount::text, t.currency, t.description, t.created_at,
         source_user.full_name AS source_user_name,
         source_user.email AS source_user_email,
         destination_user.full_name AS destination_user_name,
         destination_user.email AS destination_user_email
       FROM transactions t
       JOIN accounts source_account ON source_account.id = t.source_account_id
       LEFT JOIN users source_user ON source_user.id = source_account.user_id
       JOIN accounts destination_account ON destination_account.id = t.destination_account_id
       LEFT JOIN users destination_user ON destination_user.id = destination_account.user_id
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  public async findTransaction(transactionId: string): Promise<TransactionDetailRow | null> {
    const result = await this.database.query<TransactionDetailRow>(
      `SELECT
         t.id, t.type, t.status, t.amount::text, t.currency, t.description,
         t.external_reference, t.created_at,
         debit_account.id AS debit_account_id,
         CASE
           WHEN debit_account.account_type = 'SYSTEM' THEN 'System / ' || debit_account.system_code
           ELSE COALESCE(debit_user.full_name, debit_user.email) || ' / ' || LEFT(debit_account.id::text, 8)
         END AS debit_account_label,
         credit_account.id AS credit_account_id,
         CASE
           WHEN credit_account.account_type = 'SYSTEM' THEN 'System / ' || credit_account.system_code
           ELSE COALESCE(credit_user.full_name, credit_user.email) || ' / ' || LEFT(credit_account.id::text, 8)
         END AS credit_account_label
       FROM transactions t
       JOIN entries debit_entry
         ON debit_entry.transaction_id = t.id AND debit_entry.entry_type = 'DEBIT'
       JOIN accounts debit_account ON debit_account.id = debit_entry.account_id
       LEFT JOIN users debit_user ON debit_user.id = debit_account.user_id
       JOIN entries credit_entry
         ON credit_entry.transaction_id = t.id AND credit_entry.entry_type = 'CREDIT'
       JOIN accounts credit_account ON credit_account.id = credit_entry.account_id
       LEFT JOIN users credit_user ON credit_user.id = credit_account.user_id
       WHERE t.id = $1`,
      [transactionId],
    );
    return result.rows[0] ?? null;
  }

  public async listTransactionEntries(transactionId: string): Promise<TransactionEntryRow[]> {
    const result = await this.database.query<TransactionEntryRow>(
      `SELECT
         e.id, e.account_id, e.entry_type, e.amount::text, e.currency, e.created_at,
         a.account_type,
         CASE
           WHEN a.account_type = 'SYSTEM' THEN 'System / ' || a.system_code
           ELSE COALESCE(u.full_name, u.email) || ' / ' || LEFT(a.id::text, 8)
         END AS account_label
       FROM entries e
       JOIN accounts a ON a.id = e.account_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE e.transaction_id = $1
       ORDER BY e.amount ASC, e.id ASC`,
      [transactionId],
    );
    return result.rows;
  }
}
