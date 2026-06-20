import type { PoolClient } from 'pg';

import type { DatabasePool } from '../../infrastructure/database/postgres.js';

type Executor = DatabasePool | PoolClient;

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  role: 'USER' | 'ADMIN';
  auth_version: number;
  created_at: Date;
  updated_at: Date;
}

export class UserRepository {
  public constructor(private readonly database: DatabasePool) {}

  public async create(
    client: PoolClient,
    input: { email: string; passwordHash: string; fullName: string },
  ): Promise<UserRow> {
    const result = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.email, input.passwordHash, input.fullName],
    );
    return result.rows[0]!;
  }

  public async findByEmail(
    email: string,
    executor: Executor = this.database,
  ): Promise<UserRow | null> {
    const result = await executor.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] ?? null;
  }

  public async findById(
    userId: string,
    executor: Executor = this.database,
  ): Promise<UserRow | null> {
    const result = await executor.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] ?? null;
  }

  public async updatePassword(
    client: PoolClient,
    userId: string,
    passwordHash: string,
  ): Promise<UserRow> {
    const result = await client.query<UserRow>(
      `UPDATE users
       SET password_hash = $2,
           auth_version = auth_version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [userId, passwordHash],
    );
    return result.rows[0]!;
  }
}
