import { Request, Response } from 'express';

/**
 * Standard v2 response envelope (docs/ERROR_HANDLING_STANDARDIZATION.md).
 *
 * Success: `{ data, meta? }`
 * Error:   `{ error: { code, message, details?, requestId } }`
 *
 * Lists put their items in `data` and their paging information in `meta`
 * (including `links` with ready-to-follow paging URLs).
 */
export interface V2ListMeta {
  limit: number;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  [key: string]: unknown;
}

export interface V2SuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface V2ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface V2ErrorResponse {
  error: V2ErrorBody;
}

function resolveRequestId(req: Request): string {
  return req.requestId ?? (req.headers['x-request-id'] as string) ?? '';
}

export function v2Success<T>(data: T, meta?: Record<string, unknown>): V2SuccessResponse<T> {
  return meta === undefined ? { data } : { data, meta };
}

export function v2List<T>(req: Request, items: T[], meta: V2ListMeta): V2SuccessResponse<T[]> {
  const self = `${req.baseUrl}${req.path === '/' ? '' : req.path}`;
  const next = meta.nextCursor ? new URLSearchParams(req.query as Record<string, string>) : null;
  if (next && meta.nextCursor) next.set('cursor', meta.nextCursor);
  return {
    data: items,
    meta: {
      ...meta,
      requestId: resolveRequestId(req),
      links: {
        self: req.originalUrl,
        next: next ? `${self}?${next.toString()}` : null,
      },
    },
  };
}

export function v2Error(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  requestId = ''
): V2ErrorResponse {
  const error: V2ErrorBody = { code, message, requestId };
  if (details !== undefined) error.details = details;
  return { error };
}

declare module 'express-serve-static-core' {
  interface Response {
    /** Send a standard v2 success envelope: `{ data, meta? }`. */
    ok<T>(data: T, meta?: Record<string, unknown>): Response;
    /** Send a standard v2 error envelope: `{ error: { code, message, details?, requestId } }`. */
    fail(code: string, message: string, details?: Record<string, unknown>): Response;
  }
}

/**
 * Attach the `ok` / `fail` helpers to an Express response. Registered as
 * middleware so every v2 route can respond with the standard envelope.
 */
export function envelopeHelpers(req: Request, res: Response, next: () => void): void {
  res.ok = function ok<T>(data: T, meta?: Record<string, unknown>): Response {
    return this.json(v2Success(data, meta));
  };
  res.fail = function fail(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): Response {
    return this.json(v2Error(code, message, details, resolveRequestId(req)));
  };
  next();
}
