import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { AppError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { sendError } from '../http/api-response.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new NotFoundError(`Route ${request.method} ${request.originalUrl} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    error = new ValidationError('Request body contains malformed JSON');
  }

  if (error instanceof ZodError) {
    error = new ValidationError(
      'Request validation failed',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      request.log.error({ err: error }, 'Operational request error');
    } else {
      request.log.warn({ err: error }, 'Request rejected');
    }

    sendError(request, response, error.statusCode, {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return;
  }

  request.log.error({ err: error }, 'Unhandled request error');
  sendError(request, response, 500, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
};
