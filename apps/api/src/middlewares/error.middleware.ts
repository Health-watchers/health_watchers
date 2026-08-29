import { NextFunction, Request, Response } from 'express';
import { AppError, sendError } from '@health-watchers/utils';

export const notFoundHandler = (req: Request, res: Response) =>
  sendError(res, 404, 'NotFound', `Route ${req.method} ${req.originalUrl} not found`);

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return sendError(res, err.status, err.error, err.message);
  console.error(err);
  return sendError(res, 500, 'InternalServerError', 'Something went wrong');
};
