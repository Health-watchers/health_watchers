import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

const isDev = process.env.NODE_ENV !== 'production';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Mongoose validation error
  if (err instanceof MongooseError.ValidationError) {
    res.status(400).json({ error: 'ValidationError', message: err.message });
    return;
  }

  // Mongoose bad ObjectId
  if (err instanceof MongooseError.CastError) {
    res.status(400).json({ error: 'BadRequest', message: `Invalid value for field: ${err.path}` });
    return;
  }

  // JWT errors
  if (err instanceof TokenExpiredError) {
    res.status(401).json({ error: 'TokenExpired', message: 'Token has expired' });
    return;
  }
  
  if (err instanceof JsonWebTokenError) {
    res.status(401).json({ error: 'InvalidToken', message: 'Invalid token' });
    return;
  }

  if (isDev) {
    console.error(err);
  }

  const stack = isDev && err instanceof Error ? err.stack : undefined;
  res.status(500).json({ 
    error: 'InternalServerError', 
    message: 'An unexpected error occurred', 
    ...(stack ? { stack } : {}) 
  });
}
