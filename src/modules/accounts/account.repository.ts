import type { PoolClient } from 'pg';

import type { DatabasePool } from '../../infrastructure/database/postgres.js';

type Executor = DatabasePool | PoolClient;

export interface AccountRow {
  id: string;
  user_id: string | null;
  account_type: 'WALLET' | 'SYSTEM';
  system_code: string | null;
  currency: string;
  balance: string;
  created_at: Date;
  updated_at: Date;
}

export class AccountRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async createWallet(
    client: PoolClient,
    userId: string,
    currency: string,
  ): Promise<AccountRow> {
    const result = await client.query<AccountRow>(
      `INSERT INTO accounts (user_id, account_type, currency)
       VALUES ($1, 'WALLET', $2)
       RETURNING *`,
      [userId, currency],
    );
    return result.rows[0]!;
  }

  public async findWalletByUserId(
    userId: string,
    currency: string,
    executor: Executor = this.database,
  ): Promise<AccountRow | null> {
    const result = await executor.query<AccountRow>(
      `SELECT * FROM accounts
       WHERE user_id = $1 AND currency = $2 AND account_type = 'WALLET'`,
      [userId, currency],
    );
    return result.rows[0] ?? null;
  }

  public async findSystemAccount(
    systemCode: string,
    currency: string,
    executor: Executor = this.database,
  ): Promise<AccountRow | null> {
    const result = await executor.query<AccountRow>(
      `SELECT * FROM accounts
       WHERE system_code = $1 AND currency = $2 AND account_type = 'SYSTEM'`,
      [systemCode, currency],
    );
    return result.rows[0] ?? null;
  }

  public async lockAccounts(client: PoolClient, accountIds: string[]): Promise<AccountRow[]> {
    const uniqueIds = [...new Set(accountIds)].sort();
    const result = await client.query<AccountRow>(
      `SELECT * FROM accounts
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [uniqueIds],
    );
    return result.rows;
  }

  public async getLedgerBalance(
    accountId: string,
    executor: Executor = this.database,
  ): Promise<string> {
    const result = await executor.query<{ balance: string }>(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS balance
       FROM entries
       WHERE account_id = $1`,
      [accountId],
    );
    return result.rows[0]!.balance;
  }
}
