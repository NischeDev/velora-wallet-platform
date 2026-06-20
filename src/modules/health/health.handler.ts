import type { RequestHandler } from 'express';

import { sendError, sendSuccess } from '../../common/http/api-response.js';
import type { HealthService } from './health.service.js';

export class HealthHandler {
  public constructor(private readonly service: HealthService) {}

  public readonly liveness: RequestHandler = (request, response) => {
    sendSuccess(request, response, 200, this.service.getLiveness());
  };

  public readonly readiness: RequestHandler = async (request, response) => {
    const result = await this.service.getReadiness();

    if (result.status === 'not_ready') {
      sendError(request, response, 503, {
        code: 'SERVICE_NOT_READY',
        message: 'One or more required dependencies are unavailable',
        details: result,
      });
      return;
    }

    sendSuccess(request, response, 200, result);
  };
}
