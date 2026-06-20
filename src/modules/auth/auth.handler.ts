import type { RequestHandler } from 'express';
import { z } from 'zod';

import { sendSuccess } from '../../common/http/api-response.js';
import type { AuthService } from './auth.service.js';

const signupSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(72),
  fullName: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(72),
});

const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const forgotPasswordSchema = z.object({ email: z.email().max(254) });
const resetPasswordSchema = z.object({
  token: z.string().min(40).max(128),
  password: z.string().min(12).max(72),
});

export class AuthHandler {
  public constructor(private readonly service: AuthService) {}

  public readonly signup: RequestHandler = async (request, response) => {
    const result = await this.service.signup(signupSchema.parse(request.body));
    sendSuccess(request, response, 201, result);
  };

  public readonly login: RequestHandler = async (request, response) => {
    const input = loginSchema.parse(request.body);
    const result = await this.service.login(input.email, input.password);
    sendSuccess(request, response, 200, result);
  };

  public readonly refresh: RequestHandler = async (request, response) => {
    const input = refreshSchema.parse(request.body);
    const result = await this.service.refresh(input.refreshToken);
    sendSuccess(request, response, 200, result);
  };

  public readonly logout: RequestHandler = async (request, response) => {
    const input = refreshSchema.parse(request.body);
    await this.service.logout(input.refreshToken);
    sendSuccess(request, response, 200, { loggedOut: true });
  };

  public readonly forgotPassword: RequestHandler = async (request, response) => {
    const input = forgotPasswordSchema.parse(request.body);
    const requestId =
      typeof request.id === 'string'
        ? request.id
        : typeof request.id === 'number'
          ? String(request.id)
          : 'unknown';
    const result = await this.service.requestPasswordReset(input.email, requestId);
    sendSuccess(request, response, 202, result);
  };

  public readonly resetPassword: RequestHandler = async (request, response) => {
    const input = resetPasswordSchema.parse(request.body);
    const result = await this.service.resetPassword(input.token, input.password);
    sendSuccess(request, response, 200, result);
  };
}
