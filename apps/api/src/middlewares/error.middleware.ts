import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import logger from '../utils/logger';
import { AppError, ErrorSeverity } from '../utils/app-error';
import { ApiErrorCode } from '@health-watchers/types';
import { sendApiError } from '../utils/api-response';

const isDev = process.env.NODE_ENV !== 'production';

interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

export interface ErrorMetrics {
  total: number;
  bySeverity: Record<ErrorSeverity, number>;
  byCategory: Record<string, number>;
}

const errorMetrics: ErrorMetrics = {
  total: 0,
  bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
  byCategory: {},
};

function requestContext(req: Request) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.userId,
    clinicId: req.user?.clinicId,
  };
}

function logBySeverity(severity: ErrorSeverity, meta: object, err: unknown, message: string): void {
  switch (severity) {
    case 'critical':
    case 'high':
      logger.error({ ...meta, err }, message);
      break;
    case 'medium':
      logger.warn({ ...meta, err }, message);
      break;
    default:
      logger.info({ ...meta }, message);
  }
}

function trackError(severity: ErrorSeverity, category: string): void {
  errorMetrics.total += 1;
  errorMetrics.bySeverity[severity] += 1;
  errorMetrics.byCategory[category] = (errorMetrics.byCategory[category] ?? 0) + 1;
}

export function getErrorMetrics(): ErrorMetrics {
  return {
    total: errorMetrics.total,
    bySeverity: { ...errorMetrics.bySeverity },
    byCategory: { ...errorMetrics.byCategory },
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const ctx = requestContext(req);

  // AppError — structured application errors with severity and category
  if (err instanceof AppError) {
    trackError(err.severity, err.category);
    errorAnalytics.recordError(
      err.code ?? 'UNKNOWN_ERROR',
      err.category as unknown as ErrorCategory,
      err.severity,
      req.user?.userId,
      0
    );
    logBySeverity(
      err.severity,
      { ...ctx, category: err.category, ...(err.context ?? {}) },
      err,
      err.message
    );
    sendApiError(
      res,
      err.statusCode,
      err.category,
      err.code ?? ApiErrorCode.INTERNAL_SERVER_ERROR,
      err.message,
      { requestId: req.requestId, ...(isDev && err.stack ? { stack: err.stack } : {}) }
    );
    return;
  }

  // Zod validation errors → 400
  if (err instanceof ZodError) {
    trackError('low', 'validation');
    errorAnalytics.recordError('VALIDATION_ERROR', ErrorCategory.VALIDATION, 'low', req.user?.userId);
    logger.info({ ...ctx, details: err.errors }, 'Request validation failed');
    const details = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
    const fieldList = details.map((d) => `"${d.path}"`).join(', ');
    res.status(400).json({
      error: 'ValidationError',
      code: ApiErrorCode.VALIDATION_ERROR,
      message: `Request validation failed. Please check the following field(s): ${fieldList}.`,
      details,
      requestId: req.requestId,
    });
    return;
  }

  // Mongoose validation error → 400
  if (err instanceof MongooseError.ValidationError) {
    trackError('low', 'validation');
    errorAnalytics.recordError('VALIDATION_ERROR', ErrorCategory.VALIDATION, 'low', req.user?.userId);
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    const fieldList = details.map((d) => `"${d.path}"`).join(', ');
    logger.info({ ...ctx, details }, 'Mongoose validation error');
    res.status(400).json({
      error: 'ValidationError',
      code: ApiErrorCode.VALIDATION_ERROR,
      message: `One or more fields are invalid. Please check: ${fieldList}.`,
      details,
      requestId: req.requestId,
    });
    return;
  }

  // Mongoose bad ObjectId → 400
  if (err instanceof MongooseError.CastError) {
    trackError('low', 'validation');
    errorAnalytics.recordError('INVALID_REQUEST', ErrorCategory.VALIDATION, 'low', req.user?.userId);
    logger.info({ ...ctx, path: err.path }, 'Invalid ObjectId cast');
    res.status(400).json({
      error: 'BadRequest',
      code: ApiErrorCode.BAD_REQUEST,
      message: `"${err.path}" is not a valid ID. IDs must be 24-character hexadecimal strings.`,
      requestId: req.requestId,
    });
    return;
  }

  // MongoDB duplicate key → 409
  const mongoErr = err as MongoServerError;
  if (mongoErr?.code === 11000) {
    trackError('low', 'conflict');
    errorAnalytics.recordError('DUPLICATE_ENTRY', ErrorCategory.CONFLICT, 'low', req.user?.userId);
    const field = mongoErr.keyValue ? Object.keys(mongoErr.keyValue)[0] : 'field';
    const value = mongoErr.keyValue?.[field];
    const valueHint = value ? ` ("${value}")` : '';
    logger.warn({ ...ctx, field }, 'Duplicate key conflict');
    res.status(409).json({
      error: 'Conflict',
      code: ApiErrorCode.CONFLICT,
      message: `A record with this ${field}${valueHint} already exists. Please use a unique value.`,
      field,
      requestId: req.requestId,
    });
    return;
  }

  // JWT expired → 401
  if (err instanceof TokenExpiredError) {
    trackError('low', 'authentication');
    errorAnalytics.recordError('TOKEN_EXPIRED', ErrorCategory.AUTHENTICATION, 'low', req.user?.userId);
    logger.info({ ...ctx }, 'JWT token expired');
    res.status(401).json({
      error: 'TokenExpired',
      code: ApiErrorCode.TOKEN_EXPIRED,
      message: 'Your session has expired. Please log in again to continue.',
      requestId: req.requestId,
    });
    return;
  }

  // JWT invalid → 401
  if (err instanceof JsonWebTokenError) {
    trackError('low', 'authentication');
    errorAnalytics.recordError('INVALID_TOKEN', ErrorCategory.AUTHENTICATION, 'low', req.user?.userId);
    logger.info({ ...ctx }, 'Invalid JWT token');
    res.status(401).json({
      error: 'InvalidToken',
      code: ApiErrorCode.INVALID_TOKEN,
      message: 'The authentication token is invalid. Please log in again.',
      requestId: req.requestId,
    });
    return;
  }

  trackError('high', 'internal');
  errorAnalytics.recordError('INTERNAL_SERVER_ERROR', ErrorCategory.INTERNAL, 'high', req.user?.userId);
  if (isDev) {
    logger.error({ err }, 'Unhandled error');
  }

  // Report unexpected errors to Sentry (skips 4xx — those are expected)
  Sentry.captureException(err);

  const stack = isDev && err instanceof Error ? err.stack : undefined;
  res.status(500).json({
    error: 'InternalServerError',
    code: ApiErrorCode.INTERNAL_SERVER_ERROR,
    message:
      'An unexpected error occurred. Our team has been notified. Please try again or contact support if the problem persists.',
    requestId: req.requestId,
    ...(stack ? { stack } : {}),
  });
}

// Alias for backward compatibility
export const errorMiddleware = errorHandler;
