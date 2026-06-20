import type { PoolClient } from 'pg';

import type { DatabasePool } from './postgres.js';

export type TransactionClient = PoolClient;

export async function withTransaction<T>(
  database: DatabasePool,
  operation: (client: TransactionClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();

  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
