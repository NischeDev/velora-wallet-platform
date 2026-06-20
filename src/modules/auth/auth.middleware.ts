import type { RequestHandler } from 'express';

import { AuthenticationError } from '../../common/errors/app-error.js';
import type { TokenService } from './token.service.js';
import type { UserRepository } from './user.repository.js';

export function createAuthMiddleware(tokens: TokenService, users: UserRepository): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.header('authorization');
      if (!authorization?.startsWith('Bearer ')) {
        throw new AuthenticationError();
      }

      const token = authorization.slice('Bearer '.length).trim();
      const verified = tokens.verifyAccessToken(token);
      const user = await users.findById(verified.userId);
      if (!user || user.status !== 'ACTIVE' || user.auth_version !== verified.authVersion) {
        throw new AuthenticationError('The session is no longer valid');
      }

      request.auth = { userId: verified.userId };
      next();
    } catch (error) {
      next(error);
    }
  };
}
