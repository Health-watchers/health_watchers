import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { ApiErrorCode } from '@health-watchers/types';
import logger from '../utils/logger';

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

export function validateRequest(schemas: ValidateOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const validatePart = (
      source: keyof ValidateOptions,
      value: unknown,
      assign: (data: unknown) => void
    ): boolean => {
      const schema = schemas[source];
      if (!schema) return true;

      const result = schema.safeParse(value);
      if (!result.success) {
        const message =
          source === 'body'
            ? 'Invalid request body'
            : source === 'params'
              ? 'Invalid request params'
              : 'Invalid query parameters';
        const logMessage =
          source === 'body'
            ? 'Request body validation failed'
            : source === 'params'
              ? 'Request params validation failed'
              : 'Request query validation failed';
        const details = formatZodErrors(result.error);

        logger.warn(
          { method: req.method, path: req.path, requestId: req.requestId, source, errors: details },
          logMessage
        );

        res.status(400).json({
          error: 'ValidationError',
          code: ApiErrorCode.VALIDATION_ERROR,
          message,
          details,
          requestId: req.requestId,
        });
        return false;
      }

      assign(result.data);
      return true;
    };

    if (!validatePart('body', req.body, (data) => (req.body = data))) return;
    if (!validatePart('params', req.params, (data) => Object.assign(req.params, data))) return;
    if (!validatePart('query', req.query, (data) => Object.assign(req.query, data))) return;

    return next();
  };
}

function formatZodErrors(error: ZodError): Array<{ path: string; message: string; code: string }> {
  return error.errors.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}
