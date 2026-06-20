import { createHash, randomUUID } from 'node:crypto';

import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AuthenticationError } from '../../common/errors/app-error.js';
import type { Environment } from '../../config/environment.js';

interface VerifiedRefreshToken {
  userId: string;
  tokenId: string;
}

export class TokenService {
  private readonly issuer = 'digital-wallet-api';
  private readonly audience = 'digital-wallet-clients';

  public constructor(private readonly environment: Environment) {}

  public createAccessToken(userId: string): string {
    return jwt.sign({ type: 'access' }, this.environment.JWT_ACCESS_SECRET, {
      subject: userId,
      jwtid: randomUUID(),
      issuer: this.issuer,
      audience: this.audience,
      expiresIn: this.environment.JWT_ACCESS_TTL_SECONDS,
    });
  }

  public createRefreshToken(userId: string): {
    token: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    const tokenId = randomUUID();
    const token = jwt.sign({ type: 'refresh' }, this.environment.JWT_REFRESH_SECRET, {
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

  public verifyAccessToken(token: string): string {
    const payload = this.verify(token, this.environment.JWT_ACCESS_SECRET, 'access');
    return payload.sub!;
  }

  public verifyRefreshToken(token: string): VerifiedRefreshToken {
    const payload = this.verify(token, this.environment.JWT_REFRESH_SECRET, 'refresh');
    return { userId: payload.sub!, tokenId: payload.jti! };
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
        typeof payload.jti !== 'string'
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
