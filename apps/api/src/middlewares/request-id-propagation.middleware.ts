import { Request, Response, NextFunction } from 'express';
import { setRequestId, extractRequestId } from '@api/utils/request-id';

/**
 * Middleware to propagate request IDs across the application.
 * Stores the request ID in AsyncLocalStorage for access in downstream calls.
 */
export function requestIdPropagationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = extractRequestId(req);
  if (requestId) {
    setRequestId(requestId);
    res.setHeader('x-request-id', requestId);
  }
  next();
}
