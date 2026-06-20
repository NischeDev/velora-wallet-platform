import type { Request, Response } from 'express';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
  };
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
  };
}

function getRequestId(request: Request): string {
  if (typeof request.id === 'string') return request.id;
  if (typeof request.id === 'number') return String(request.id);
  return 'unknown';
}

export function sendSuccess<T>(
  request: Request,
  response: Response,
  statusCode: number,
  data: T,
): void {
  const payload: SuccessEnvelope<T> = {
    success: true,
    data,
    meta: {
      requestId: getRequestId(request),
    },
  };

  response.status(statusCode).json(payload);
}

export function sendError(
  request: Request,
  response: Response,
  statusCode: number,
  error: ErrorEnvelope['error'],
): void {
  const payload: ErrorEnvelope = {
    success: false,
    error,
    meta: {
      requestId: getRequestId(request),
    },
  };

  response.status(statusCode).json(payload);
}
