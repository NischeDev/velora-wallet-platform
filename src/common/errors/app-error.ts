export class AppError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace(this, new.target);
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'The requested resource was not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  public constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  public constructor(message = 'Authentication is required') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class ForbiddenError extends AppError {
  public constructor(message = 'You are not allowed to perform this action') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  public constructor(message: string, code = 'CONFLICT', details?: unknown) {
    super(message, 409, code, details);
  }
}

export class InsufficientFundsError extends AppError {
  public constructor() {
    super('The wallet does not have enough available funds', 409, 'INSUFFICIENT_FUNDS');
  }
}
