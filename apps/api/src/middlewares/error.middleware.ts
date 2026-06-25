import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import logger from '../utils/logger';
import { AppError, ErrorSeverity } from '../utils/app-error';

const isDev = process.env.NODE_ENV !== 'production';

interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

function requestContext(req: Request) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    userId: req.user?.userId,
    clinicId: req.user?.clinicId,
  };
}

function logBySeverity(
  severity: ErrorSeverity,
  meta: object,
  err: unknown,
  message: string
): void {
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

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const ctx = requestContext(req);

  // AppError — structured application errors with severity and category
  if (err instanceof AppError) {
    logBySeverity(
      err.severity,
      { ...ctx, category: err.category, ...(err.context ?? {}) },
      err,
      err.message
    );
    res.status(err.statusCode).json({
      error: err.category,
      message: err.message,
      requestId: req.requestId,
      ...(isDev && err.stack ? { stack: err.stack } : {}),
    });
    return;
  }

  // Zod validation errors → 400
  if (err instanceof ZodError) {
    logger.info({ ...ctx, details: err.errors }, 'Request validation failed');
    res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      requestId: req.requestId,
    });
    return;
  }

  // Mongoose validation error → 400
  if (err instanceof MongooseError.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    logger.info({ ...ctx, details }, 'Mongoose validation error');
    res.status(400).json({
      error: 'ValidationError',
      message: err.message,
      details,
      requestId: req.requestId,
    });
    return;
  }

  // Mongoose bad ObjectId → 400
  if (err instanceof MongooseError.CastError) {
    logger.info({ ...ctx, path: err.path }, 'Invalid ObjectId cast');
    res.status(400).json({
      error: 'BadRequest',
      message: `Invalid value for field: ${err.path}`,
      requestId: req.requestId,
    });
    return;
  }

  // MongoDB duplicate key → 409
  const mongoErr = err as MongoServerError;
  if (mongoErr?.code === 11000) {
    const field = mongoErr.keyValue ? Object.keys(mongoErr.keyValue)[0] : 'field';
    logger.warn({ ...ctx, field }, 'Duplicate key conflict');
    res.status(409).json({
      error: 'Conflict',
      message: `Duplicate value for field: ${field}`,
      field,
      requestId: req.requestId,
    });
    return;
  }

  // JWT expired → 401
  if (err instanceof TokenExpiredError) {
    logger.info({ ...ctx }, 'JWT token expired');
    res.status(401).json({
      error: 'TokenExpired',
      message: 'Token has expired',
      requestId: req.requestId,
    });
    return;
  }

  // JWT invalid → 401
  if (err instanceof JsonWebTokenError) {
    logger.info({ ...ctx }, 'Invalid JWT token');
    res.status(401).json({
      error: 'InvalidToken',
      message: 'Invalid token',
      requestId: req.requestId,
    });
    return;
  }

  if (isDev) {
    logger.error({ err }, 'Unhandled error');
  }

  // Report unexpected errors to Sentry (skips 4xx — those are expected)
  Sentry.captureException(err);

  const stack = isDev && err instanceof Error ? err.stack : undefined;
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
    requestId: req.requestId,
    ...(stack ? { stack } : {}),
  });
}

// Alias for backward compatibility
export const errorMiddleware = errorHandler;
