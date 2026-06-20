import type { PoolClient } from 'pg';

export interface IdempotencyRow {
  id: string;
  user_id: string;
  idempotency_key: string;
  endpoint: string;
  request_hash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  response_status: number | null;
  response_body: unknown;
  expires_at: Date;
}

export class IdempotencyRepository {
  public async claim(
    client: PoolClient,
    input: {
      userId: string;
      key: string;
      endpoint: string;
      requestHash: string;
      expiresAt: Date;
    },
  ): Promise<IdempotencyRow> {
    await client.query(
      `INSERT INTO idempotency_keys
         (user_id, idempotency_key, endpoint, request_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, idempotency_key, endpoint) DO NOTHING`,
      [input.userId, input.key, input.endpoint, input.requestHash, input.expiresAt],
    );

    let row = await this.findForUpdate(client, input.userId, input.key, input.endpoint);
    if (!row) throw new Error('Idempotency key could not be claimed');

    if (row.expires_at.getTime() <= Date.now()) {
      await client.query('DELETE FROM idempotency_keys WHERE id = $1', [row.id]);
      const result = await client.query<IdempotencyRow>(
        `INSERT INTO idempotency_keys
           (user_id, idempotency_key, endpoint, request_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.userId, input.key, input.endpoint, input.requestHash, input.expiresAt],
      );
      row = result.rows[0]!;
    }

    return row;
  }

  public async complete(
    client: PoolClient,
    id: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_keys
       SET status = 'COMPLETED', response_status = $2, response_body = $3,
           completed_at = NOW()
       WHERE id = $1`,
      [id, responseStatus, JSON.stringify(responseBody)],
    );
  }

  private async findForUpdate(
    client: PoolClient,
    userId: string,
    key: string,
    endpoint: string,
  ): Promise<IdempotencyRow | null> {
    const result = await client.query<IdempotencyRow>(
      `SELECT * FROM idempotency_keys
       WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3
       FOR UPDATE`,
      [userId, key, endpoint],
    );
    return result.rows[0] ?? null;
  }
}
