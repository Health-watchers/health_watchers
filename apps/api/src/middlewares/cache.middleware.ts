import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { cache } from '../services/cache.service';

/**
 * Cache middleware — serves cached response or caches the outgoing JSON.
 *
 * @param ttl        TTL in seconds
 * @param keyFn      Optional key builder; defaults to `clinicId:METHOD:path`
 */
export function cacheResponse(ttl: number, keyFn?: (req: Request) => string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn ? keyFn(req) : `${req.user?.clinicId ?? 'global'}:${req.method}:${req.path}`;

    const cached = await cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // Intercept res.json to cache the outgoing response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(key, body, ttl).catch(() => {
          /* already logged inside cache.set */
        });
      }
      return originalJson(body);
    };

    next();
  };
}
