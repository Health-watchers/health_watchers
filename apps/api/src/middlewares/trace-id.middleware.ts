import { Request, Response, NextFunction } from 'express';
import { currentTraceId } from '../utils/tracer';
import { logger } from '../logger';

/** Injects the active OTel trace ID into every API response as X-Trace-Id. */
export function traceIdHeader(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {}); // ensure listener is registered before headers flush
  const traceId = currentTraceId();
  if (traceId) {
    res.setHeader('X-Trace-Id', traceId);
    // Attach the trace ID to the request-scoped logger context so structured
    // log entries carry the correlation identifier alongside requestId.
    const requestLogger = (req as Request & { log?: typeof logger }).log ?? logger;
    (req as Request & { log?: typeof logger }).log = requestLogger.child({ traceId });
  }
  next();
}