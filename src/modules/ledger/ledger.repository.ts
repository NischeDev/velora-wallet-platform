import type { PoolClient } from 'pg';

export interface TransactionRow {
  id: string;
  type: 'DEPOSIT' | 'TRANSFER' | 'WITHDRAWAL';
  status: 'POSTED';
  amount: string;
  currency: string;
  source_account_id: string;
  destination_account_id: string;
  external_reference: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export class LedgerRepository {
  public async findTransactionById(
    client: PoolClient,
    transactionId: string,
  ): Promise<TransactionRow | null> {
    const result = await client.query<TransactionRow>('SELECT * FROM transactions WHERE id = $1', [
      transactionId,
    ]);
    return result.rows[0] ?? null;
  }

  public async createTransaction(
    client: PoolClient,
    input: {
      type: TransactionRow['type'];
      amount: bigint;
      currency: string;
      sourceAccountId: string;
      destinationAccountId: string;
      externalReference?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TransactionRow> {
    const result = await client.query<TransactionRow>(
      `INSERT INTO transactions
         (type, amount, currency, source_account_id, destination_account_id,
          external_reference, description, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.type,
        input.amount.toString(),
        input.currency,
        input.sourceAccountId,
        input.destinationAccountId,
        input.externalReference ?? null,
        input.description ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return result.rows[0]!;
  }

  public async addBalancedEntries(
    client: PoolClient,
    input: {
      transactionId: string;
      debitAccountId: string;
      creditAccountId: string;
      amount: bigint;
      currency: string;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO entries (transaction_id, account_id, entry_type, amount, currency)
       VALUES
         ($1, $2, 'DEBIT', $3, $5),
         ($1, $4, 'CREDIT', $6, $5)`,
      [
        input.transactionId,
        input.debitAccountId,
        (-input.amount).toString(),
        input.creditAccountId,
        input.currency,
        input.amount.toString(),
      ],
    );
  }
}
