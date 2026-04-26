import { Request, Response, NextFunction } from 'express';
import { currentTraceId } from '../utils/tracer';

/** Injects the active OTel trace ID into every API response as X-Trace-Id. */
export function traceIdHeader(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {}); // ensure listener is registered before headers flush
  const traceId = currentTraceId();
  if (traceId) res.setHeader('X-Trace-Id', traceId);
  next();
}
