import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { setRequestId, extractRequestId } from '@api/utils/request-id';

/**
 * Middleware to propagate request IDs across the application.
 * Stores the request ID in AsyncLocalStorage for access in downstream calls.
 *
 * Behavior:
 * - If an inbound `X-Request-ID` header is present, it is passed through.
 * - Otherwise, a new UUID is generated.
 * - The resolved ID is always stored via `setRequestId` and echoed back on the
 *   `x-request-id` response header.
 *
 * Composition with `correlationMiddleware`:
 * - If a request ID has already been resolved earlier in the chain (e.g. by
 *   `correlationMiddleware`), it is reused rather than regenerated. This is
 *   detected by checking the response header that `correlationMiddleware` sets,
 *   as well as the inbound header, so the two middlewares never double-generate.
 */
export function requestIdPropagationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Prefer an ID already resolved upstream (e.g. by correlationMiddleware),
  // then fall back to the inbound header, and finally generate a fresh UUID.
  const existingHeader = res.getHeader('x-request-id');
  const existingId =
    typeof existingHeader === 'string' && existingHeader.length > 0
      ? existingHeader
      : Array.isArray(existingHeader) && existingHeader.length > 0
        ? String(existingHeader[0])
        : undefined;

  const requestId = existingId ?? extractRequestId(req) ?? randomUUID();

  setRequestId(requestId);
  res.setHeader('x-request-id', requestId);

  next();
}