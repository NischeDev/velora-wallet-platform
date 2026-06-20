import { createHash, randomBytes, randomUUID } from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AuthenticationError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/environment.js';

interface VerifiedRefreshToken {
  userId: string;
  tokenId: string;
  authVersion: number;
}

interface VerifiedAccessToken {
  userId: string;
  authVersion: number;
}

export class TokenService {
  private readonly issuer = 'digital-wallet-api';
  private readonly audience = 'digital-wallet-clients';

  public constructor(private readonly environment: Environment) {}

  public createAccessToken(userId: string, authVersion: number): string {
    return jwt.sign({ type: 'access', authVersion }, this.environment.JWT_ACCESS_SECRET, {
      subject: userId,
      jwtid: randomUUID(),
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.environment.JWT_ACCESS_TTL_SECONDS,
    });
  }

  public createRefreshToken(
    userId: string,
    authVersion: number,
  ): {
    token: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    const tokenId = randomUUID();
    const token = jwt.sign({ type: 'refresh', authVersion }, this.environment.JWT_REFRESH_SECRET, {
      subject: userId,
      jwtid: tokenId,
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.environment.JWT_REFRESH_TTL_SECONDS,
    });

    return {
      token,
      tokenId,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + this.environment.JWT_REFRESH_TTL_SECONDS * 1000),
    };
  }

  public createPasswordResetToken(): {
    token: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      tokenId: randomUUID(),
      tokenHash: this.hashToken(token),
      expiresAt: new Date(Date.now() + this.environment.PASSWORD_RESET_TTL_SECONDS * 1000),
    };
  }

  public verifyAccessToken(token: string): VerifiedAccessToken {
    const payload = this.verify(token, this.environment.JWT_ACCESS_SECRET, 'access');
    return { userId: payload.sub!, authVersion: payload.authVersion as number };
  }

  public verifyRefreshToken(token: string): VerifiedRefreshToken {
    const payload = this.verify(token, this.environment.JWT_REFRESH_SECRET, 'refresh');
    return {
      userId: payload.sub!,
      tokenId: payload.jti!,
      authVersion: payload.authVersion as number,
    };
  }

  public hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private verify(token: string, secret: string, expectedType: 'access' | 'refresh'): JwtPayload {
    try {
      const payload = jwt.verify(token, secret, {
        issuer: this.issuer,
        audience: this.audience,
      });

      if (
        typeof payload === 'string' ||
        payload.type !== expectedType ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string' ||
        typeof payload.authVersion !== 'number' ||
        !Number.isInteger(payload.authVersion) ||
        payload.authVersion < 1
      ) {
        throw new AuthenticationError('The token is invalid');
      }
      return payload;
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('The token is invalid or expired');
    }
  }
}
