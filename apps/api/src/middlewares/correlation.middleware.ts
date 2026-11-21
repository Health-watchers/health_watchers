import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../logger';

export const CORRELATION_HEADER = 'x-request-id';

/**
 * pino-http logger — generates a UUID v4 requestId for every request,
 * honouring an incoming X-Request-ID header so upstream callers can
 * inject their own correlation id (e.g. the web app or stellar-service).
 *
 * Emits the standardized JSON log format with mandatory fields:
 * timestamp, level, service, requestId, message
 * plus request-scoped clinicId and userId when available.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId(req) {
    // Honour an upstream-supplied id, otherwise mint a fresh UUID v4
    const incoming = (req.headers as Record<string, string | undefined>)[CORRELATION_HEADER];
    return incoming ?? randomUUID();
  },
  // Standardized field mapping: requestId, clinicId, userId on every entry
  customProps(req) {
    const r = req as any;
    return {
      requestId: r.id,
      clinicId: r.clinicId ?? r.user?.clinicId ?? undefined,
      userId: r.userId ?? r.user?.id ?? undefined,
    };
  },
  // Standardized message field
  customSuccessMessage(req) {
    return `${req.method} ${req.url} completed`;
  },
  customErrorMessage(req) {
    return `${req.method} ${req.url} errored`;
  },
  serializers: {
    req(req: any) {
      return {
        method: req.method,
        url: req.url,
        requestId: req.id,
        clinicId: req.clinicId ?? req.user?.clinicId ?? undefined,
        userId: req.userId ?? req.user?.id ?? undefined,
      };
    },
    res(res: any) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
});

/**
 * Stamps req.requestId and echoes X-Request-ID on every response.
 * Must be mounted AFTER httpLogger so req.id is already set.
 *
 * Also binds a request-scoped child logger onto req.log carrying
 * requestId, clinicId and userId so all request-scoped log entries
 * include those fields.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // pino-http stores the id on req.id
  const id = (req as any).id as string;
  req.requestId = id;
  res.setHeader(CORRELATION_HEADER, id);

  // Bind a request-scoped child logger with the mandatory request fields.
  // clinicId/userId may be populated later by auth middleware; the child
  // logger is re-bound there if needed.
  const r = req as any;
  const bindings: Record<string, unknown> = { requestId: id };
  const clinicId = r.clinicId ?? r.user?.clinicId;
  const userId = r.userId ?? r.user?.id;
  if (clinicId !== undefined) bindings.clinicId = clinicId;
  if (userId !== undefined) bindings.userId = userId;

  r.log = logger.child(bindings);
  next();
}