import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

export function createRequestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId(request, response) {
      const suppliedRequestId = request.headers['x-request-id'];
      const requestId =
        typeof suppliedRequestId === 'string' && suppliedRequestId.length <= 128
          ? suppliedRequestId
          : randomUUID();

      response.setHeader('x-request-id', requestId);
      return requestId;
    },
    customLogLevel(_request, response, error) {
      if (error || response.statusCode >= 500) return 'error';
      if (response.statusCode >= 400) return 'warn';
      return 'info';
    },
  });
}
