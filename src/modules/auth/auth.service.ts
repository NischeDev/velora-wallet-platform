import bcrypt from 'bcrypt';
import type { PoolClient } from 'pg';

import { AuthenticationError, ConflictError } from '../../common/errors/app-error.js';
import { isPostgresError } from '../../common/database/postgres-error.js';
import type { Environment } from '../../config/environment.js';
import type { DatabasePool } from '../../infrastructure/database/postgres.js';
import { withTransaction } from '../../infrastructure/database/transaction.js';
import type { AccountRepository } from '../accounts/account.repository.js';
import type { RefreshTokenRepository } from './refresh-token.repository.js';
import type { TokenService } from './token.service.js';
import type { UserRepository, UserRow } from './user.repository.js';

interface AuthResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'USER' | 'ADMIN';
    createdAt: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export class AuthService {
  public constructor(
    private readonly database: DatabasePool,
    private readonly users: UserRepository,
    private readonly accounts: AccountRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly tokens: TokenService,
    private readonly environment: Environment,
  ) {}

  public async signup(input: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, this.environment.BCRYPT_ROUNDS);

    try {
      return await withTransaction(this.database, async (client) => {
        const user = await this.users.create(client, {
          email,
          passwordHash,
          fullName: input.fullName.trim(),
        });
        await this.accounts.createWallet(client, user.id, this.environment.DEFAULT_CURRENCY);
        return this.issueSession(client, user);
      });
    } catch (error) {
      if (isPostgresError(error, '23505')) {
        throw new ConflictError('An account already exists for this email', 'EMAIL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  public async login(emailInput: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase());
    const validPassword = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !validPassword || user.status !== 'ACTIVE') {
      throw new AuthenticationError('Email or password is incorrect');
    }

    return withTransaction(this.database, (client) => this.issueSession(client, user));
  }

  public async refresh(refreshToken: string): Promise<AuthResult> {
    const verified = this.tokens.verifyRefreshToken(refreshToken);
    const tokenHash = this.tokens.hashToken(refreshToken);

    return withTransaction(this.database, async (client) => {
      const stored = await this.refreshTokens.findByHashForUpdate(client, tokenHash);
      if (
        !stored ||
        stored.id !== verified.tokenId ||
        stored.user_id !== verified.userId ||
        stored.revoked_at !== null ||
        stored.expires_at.getTime() <= Date.now()
      ) {
        throw new AuthenticationError('Refresh token is invalid or has already been used');
      }

      const user = await this.users.findById(verified.userId, client);
      if (!user || user.status !== 'ACTIVE') throw new AuthenticationError();

      const nextRefreshToken = this.tokens.createRefreshToken(user.id);
      await this.refreshTokens.revoke(client, stored.id, nextRefreshToken.tokenId);
      await this.refreshTokens.create(client, {
        id: nextRefreshToken.tokenId,
        userId: user.id,
        tokenHash: nextRefreshToken.tokenHash,
        expiresAt: nextRefreshToken.expiresAt,
      });

      return this.formatAuthResult(user, nextRefreshToken.token);
    });
  }

  public async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.tokens.hashToken(refreshToken);
    await withTransaction(this.database, async (client) => {
      const stored = await this.refreshTokens.findByHashForUpdate(client, tokenHash);
      if (stored) await this.refreshTokens.revoke(client, stored.id);
    });
  }

  private async issueSession(client: PoolClient, user: UserRow): Promise<AuthResult> {
    const refreshToken = this.tokens.createRefreshToken(user.id);
    await this.refreshTokens.create(client, {
      id: refreshToken.tokenId,
      userId: user.id,
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt,
    });
    return this.formatAuthResult(user, refreshToken.token);
  }

  private formatAuthResult(user: UserRow, refreshToken: string): AuthResult {
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        createdAt: user.created_at.toISOString(),
      },
      accessToken: this.tokens.createAccessToken(user.id),
      refreshToken,
      expiresInSeconds: this.environment.JWT_ACCESS_TTL_SECONDS,
    };
  }
}
