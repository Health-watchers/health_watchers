import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import logger from '../utils/logger';

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validateRequest(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        logger.warn(
          { method: req.method, path: req.path, errors: result.error.errors },
          'Request body validation failed'
        );
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid request body',
          details: result.error.errors,
        });
      }
      req.body = result.data;
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        logger.warn(
          { method: req.method, path: req.path, errors: result.error.errors },
          'Request params validation failed'
        );
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid request params',
          details: result.error.errors,
        });
      }
      Object.assign(req.params, result.data);
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        logger.warn(
          { method: req.method, path: req.path, errors: result.error.errors },
          'Request query validation failed'
        );
        return res.status(400).json({
          error: 'ValidationError',
          message: 'Invalid query parameters',
          details: result.error.errors,
        });
      }
      Object.assign(req.query, result.data);
    }

    return next();
  };
}
