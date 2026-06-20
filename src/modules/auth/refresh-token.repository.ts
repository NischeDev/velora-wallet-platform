import type { PoolClient } from 'pg';

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by: string | null;
  created_at: Date;
}

export class RefreshTokenRepository {
  public async create(
    client: PoolClient,
    input: { id: string; userId: string; tokenHash: string; expiresAt: Date },
  ): Promise<void> {
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.userId, input.tokenHash, input.expiresAt],
    );
  }

  public async findByHashForUpdate(
    client: PoolClient,
    tokenHash: string,
  ): Promise<RefreshTokenRow | null> {
    const result = await client.query<RefreshTokenRow>(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  public async revoke(client: PoolClient, id: string, replacedBy?: string): Promise<void> {
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = COALESCE(revoked_at, NOW()), replaced_by = COALESCE($2, replaced_by)
       WHERE id = $1`,
      [id, replacedBy ?? null],
    );
  }
}
