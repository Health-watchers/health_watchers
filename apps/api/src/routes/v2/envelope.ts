import { Request } from 'express';

/**
 * Standard v2 response envelope (docs/api-versioning-strategy.md).
 *
 * Lists return `items` + a `meta` object instead of the v1 `data[]` +
 * `pagination` pair; `links` carries ready-to-follow paging URLs.
 */
export interface V2ListMeta {
  limit: number;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  [key: string]: unknown;
}

export function v2List<T>(req: Request, items: T[], meta: V2ListMeta) {
  const self = `${req.baseUrl}${req.path === '/' ? '' : req.path}`;
  const next = meta.nextCursor ? new URLSearchParams(req.query as Record<string, string>) : null;
  if (next) next.set('cursor', meta.nextCursor!);
  return {
    success: true as const,
    version: '2.0' as const,
    items,
    meta: { ...meta, requestId: req.requestId ?? (req.headers['x-request-id'] as string) },
    links: {
      self: req.originalUrl,
      next: next ? `${self}?${next.toString()}` : null,
    },
  };
}

export function v2Error(code: string, message: string, details?: Record<string, unknown>) {
  return { success: false as const, version: '2.0' as const, error: { code, message, ...details } };
}
