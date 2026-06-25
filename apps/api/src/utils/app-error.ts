export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'external'
  | 'internal';

export class AppError extends Error {
  readonly statusCode: number;
  readonly severity: ErrorSeverity;
  readonly category: ErrorCategory;
  readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    options: {
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      isOperational?: boolean;
      context?: Record<string, unknown>;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.severity = options.severity ?? (statusCode >= 500 ? 'high' : 'low');
    this.category = options.category ?? 'internal';
    this.isOperational = options.isOperational ?? true;
    this.context = options.context;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, context?: Record<string, unknown>): AppError {
    return new AppError(message, 400, { severity: 'low', category: 'validation', context });
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401, { severity: 'low', category: 'authentication' });
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403, { severity: 'medium', category: 'authorization' });
  }

  static notFound(resource: string): AppError {
    return new AppError(`${resource} not found`, 404, { severity: 'low', category: 'not_found' });
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, { severity: 'low', category: 'conflict' });
  }

  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(message, 429, { severity: 'medium', category: 'rate_limit' });
  }

  static internal(message = 'Internal server error', context?: Record<string, unknown>): AppError {
    return new AppError(message, 500, {
      severity: 'high',
      category: 'internal',
      isOperational: false,
      context,
    });
  }

  static external(message: string, context?: Record<string, unknown>): AppError {
    return new AppError(message, 502, { severity: 'high', category: 'external', context });
  }
}
