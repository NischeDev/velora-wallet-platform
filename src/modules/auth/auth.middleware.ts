import type { RequestHandler } from 'express';

import { AuthenticationError } from '../../common/errors/app-error.js';
import type { TokenService } from './token.service.js';

export function createAuthMiddleware(tokens: TokenService): RequestHandler {
  return (request, _response, next) => {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      next(new AuthenticationError());
      return;
    }

    const token = authorization.slice('Bearer '.length).trim();
    request.auth = { userId: tokens.verifyAccessToken(token) };
    next();
  };
}
