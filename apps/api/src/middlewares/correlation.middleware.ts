import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';

export const CORRELATION_HEADER = 'x-request-id';

/**
 * pino-http logger — generates a UUID v4 requestId for every request,
 * honouring an incoming X-Request-ID header so upstream callers can
 * inject their own correlation id (e.g. the web app or stellar-service).
 */
export const httpLogger = pinoHttp({
  genReqId(req) {
    // Honour an upstream-supplied id, otherwise mint a fresh UUID v4
    const incoming = (req.headers as Record<string, string | undefined>)[CORRELATION_HEADER];
    return incoming ?? randomUUID();
  },
  // Attach the id back onto req so other middleware can read it
  customReceivedMessage(_req) { return undefined as unknown as string; },
});

/**
 * Stamps req.requestId and echoes X-Request-ID on every response.
 * Must be mounted AFTER httpLogger so req.id is already set.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // pino-http stores the id on req.id
  const id = (req as any).id as string;
  req.requestId = id;
  res.setHeader(CORRELATION_HEADER, id);
  next();
}
