import { Request, Response, NextFunction } from 'express';
import type { RequestHandler } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { ApiErrorCode } from '@health-watchers/types';
import logger from '../utils/logger';

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

type RequestPart = keyof ValidateOptions;

function validationMessage(source: RequestPart): string {
  if (source === 'body') return 'Invalid request body';
  if (source === 'params') return 'Invalid request params';
  return 'Invalid query parameters';
}

function validationLogMessage(source: RequestPart): string {
  if (source === 'body') return 'Request body validation failed';
  if (source === 'params') return 'Request params validation failed';
  return 'Request query validation failed';
}

function schemaForPart(schemas: ValidateOptions, source: RequestPart): ZodSchema | undefined {
  if (source === 'body') return schemas.body;
  if (source === 'params') return schemas.params;
  return schemas.query;
}

export function validateRequest(schemas: ValidateOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const validatePart = (
      source: RequestPart,
      value: unknown,
      assign: (data: unknown) => void
    ): boolean => {
      const schema = schemaForPart(schemas, source);
      if (!schema) return true;

      const result = schema.safeParse(value);
      if (!result.success) {
        const details = formatZodErrors(result.error);

        logger.warn(
          { method: req.method, path: req.path, requestId: req.requestId, source, errors: details },
          validationLogMessage(source)
        );

        res.status(400).json({
          error: 'ValidationError',
          code: ApiErrorCode.VALIDATION_ERROR,
          message: validationMessage(source),
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
