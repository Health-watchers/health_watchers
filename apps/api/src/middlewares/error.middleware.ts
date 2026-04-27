import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError } from 'zod';
import logger from '../utils/logger';

const isDev = process.env.NODE_ENV !== 'production';

interface MongoServerError extends Error {
  code?: number;
  keyValue?: Record<string, unknown>;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
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
    const details = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));
    res.status(400).json({ error: 'ValidationError', message: err.message, details, requestId: req.requestId });
    return;
  }

  // Mongoose bad ObjectId → 400
  if (err instanceof MongooseError.CastError) {
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
    res.status(401).json({ error: 'TokenExpired', message: 'Token has expired', requestId: req.requestId });
    return;
  }

  // JWT invalid → 401
  if (err instanceof JsonWebTokenError) {
    res.status(401).json({ error: 'InvalidToken', message: 'Invalid token', requestId: req.requestId });
    return;
  }

  if (isDev) {
    logger.error({ err }, 'Unhandled error');
  }

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
