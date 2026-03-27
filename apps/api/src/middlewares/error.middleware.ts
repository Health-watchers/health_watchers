import { Request, Response, NextFunction } from 'express';

/**
 * Global error handler — always includes requestId in the response body
 * so clients can correlate errors with server-side log entries.
 */
export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = (err as any).status ?? (err as any).statusCode ?? 500;

  res.status(status).json({
    error:     err.name || 'InternalError',
    message:   err.message || 'An unexpected error occurred.',
    requestId: req.requestId,
  });
}
