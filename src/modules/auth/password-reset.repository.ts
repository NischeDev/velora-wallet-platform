import type { PoolClient } from 'pg';

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export class PasswordResetRepository {
  public async invalidateActive(client: PoolClient, userId: string): Promise<void> {
    await client.query(
      `UPDATE password_reset_tokens
       SET consumed_at = NOW()
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [userId],
    );
  }

  public async create(
    client: PoolClient,
    input: { id: string; userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    await client.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  public async findByHashForUpdate(
    client: PoolClient,
    tokenHash: string,
  ): Promise<PasswordResetTokenRow | null> {
    const result = await client.query<PasswordResetTokenRow>(
      `SELECT *
       FROM password_reset_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  public async consume(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE password_reset_tokens
       SET consumed_at = NOW()
       WHERE id = $1 AND consumed_at IS NULL`,
      [id],
    );
  }
}
