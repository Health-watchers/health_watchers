/**
 * #1252 — Per-API-key rate limiting.
 *
 * Applies a fixed 60-second window ceiling taken from the key's
 * `rateLimitPerMin` field (0 = no per-key limit, the global limiter still
 * applies). Counts live in Redis when available so the limit holds across
 * API instances; a process-local map is the fallback for single-node / test.
 *
 * Must run AFTER `authenticateApiKey` (it reads `req.apiKey`).
 */

import { Request, Response, NextFunction } from 'express';
import { cache } from '../services/cache.service';
import type { ApiKeyContext } from './api-key.middleware';
import { trackApiKeyUsage } from './api-key.middleware';

const WINDOW_SECONDS = 60;

// Fallback store: apiKeyId -> { count, resetAt(ms) }
const localBuckets = new Map<string, { count: number; resetAt: number }>();

function localHit(
  id: string,
  limit: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = localBuckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_SECONDS * 1000 };
    localBuckets.set(id, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

async function redisHit(
  id: string,
  limit: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number } | null> {
  const windowId = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `apikey:rl:${id}:${windowId}`;
  try {
    const current = await cache.incr(key, WINDOW_SECONDS);
    if (current === null) return null; // redis unavailable
    const resetAt = (windowId + 1) * WINDOW_SECONDS * 1000;
    return { allowed: current <= limit, remaining: Math.max(0, limit - current), resetAt };
  } catch {
    return null;
  }
}

export function apiKeyRateLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = (req as any).apiKey as ApiKeyContext | undefined;
    if (!ctx || !ctx.rateLimitPerMin || ctx.rateLimitPerMin <= 0) return next();

    const limit = ctx.rateLimitPerMin;
    const result = (await redisHit(ctx.id, limit)) ?? localHit(ctx.id, limit);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      trackApiKeyUsage(ctx.id, ctx.clinicId, req.path, 'rejected');
      return res.status(429).json({
        error: 'TooManyRequests',
        message: `API key rate limit of ${limit} requests/min exceeded`,
      });
    }

    return next();
  };
}

/** Test helper — clears the in-process fallback store. */
export function __resetApiKeyRateLimitBuckets() {
  localBuckets.clear();
}
