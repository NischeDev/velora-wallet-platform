import type { RequestHandler } from 'express';

import { AuthenticationError, ForbiddenError } from '../../common/errors/app-error.js';
import type { UserRepository } from '../auth/user.repository.js';

export function createAdminMiddleware(users: UserRepository): RequestHandler {
  return async (request, _response, next) => {
    const userId = request.auth?.userId;
    if (!userId) {
      next(new AuthenticationError());
      return;
    }

    const user = await users.findById(userId);
    if (!user || user.status !== 'ACTIVE' || user.role !== 'ADMIN') {
      next(new ForbiddenError('Administrator access is required'));
      return;
    }

    request.auth = { userId, role: user.role };
    next();
  };
}
