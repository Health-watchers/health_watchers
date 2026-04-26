import { Request, Response, NextFunction } from 'express';

/**
 * In-memory rate limiter: max 5 export requests per clinic per hour.
 * For production, replace with Redis-backed store.
 */
const WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 5;

interface RateEntry { count: number; resetAt: number; }
const store = new Map<string, RateEntry>();

export function exportRateLimit(req: Request, res: Response, next: NextFunction) {
  const clinicId = req.user?.clinicId;
  if (!clinicId)
    return res.status(401).json({ error: 'Unauthorized', message: 'No clinic context' });

  const now = Date.now();
  let entry = store.get(clinicId);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(clinicId, entry);
  }

  entry.count += 1;

  res.set('X-RateLimit-Limit',     String(MAX_REQUESTS));
  res.set('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS - entry.count)));
  res.set('X-RateLimit-Reset',     String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error:   'TooManyRequests',
      message: `Export limit of ${MAX_REQUESTS} requests per hour exceeded. Retry after ${retryAfter}s.`,
    });
  }

  return next();
}
