import type { NextFunction, Request, Response } from 'express';
import { createClient, type RedisClientType } from 'redis';
import logger from '../utils/logger';
import { rateLimitHitsTotal } from '../services/metrics.service';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RateLimitConfig {
  /** Unique limiter name, used as the metrics label and Redis key prefix. */
  name: string;
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per window. */
  max: number;
  /** Response body returned on 429. */
  message: object;
  /** Derives the bucket key for a request. Defaults to the client IP. */
  keyGenerator?: (req: Request) => string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest hit leaves the window (for Retry-After). */
  retryAfter: number;
  /** Unix ms timestamp of the oldest hit in the window. */
  oldest: number;
}

// ── Redis client (lazy, shared) ───────────────────────────────────────────────
let redisClient: RedisClientType | null = null;
let redisReady = false;

function getRedisClient(): RedisClientType | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (!redisClient) {
    try {
      const client = createClient({ url: redisUrl });
      client.on('error', (err: Error) => {
        redisReady = false;
        logger.error(`[rate-limit] Redis connection error: ${err.message}`);
        logger.warn('[rate-limit] Falling back to in-memory store for rate limiting');
      });
      client.on('ready', () => {
        redisReady = true;
        logger.info('[rate-limit] Redis sliding-window store ready');
      });
      client.on('end', () => {
        redisReady = false;
      });
      client.connect().catch((err: Error) => {
        redisReady = false;
        logger.error(`[rate-limit] Failed to connect Redis store: ${err.message}`);
      });
      redisClient = client as RedisClientType;
    } catch (err) {
      logger.error(
        `[rate-limit] Failed to configure Redis store: ${err instanceof Error ? err.message : String(err)}`
      );
      logger.warn(
        '[rate-limit] Falling back to in-memory store. Multi-instance deployments are NOT protected.'
      );
      return null;
    }
  }

  return redisReady ? redisClient : null;
}

// ── Sliding-window Lua script (atomic ZADD/ZREMRANGEBYSCORE/ZCARD) ────────────
// KEYS[1] = sorted-set key
// ARGV[1] = now (ms), ARGV[2] = windowMs, ARGV[3] = max, ARGV[4] = unique member suffix
// Returns { allowed (0|1), remaining, oldestScore }
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
local clearBefore = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local count = redis.call('ZCARD', key)

if count < max then
  redis.call('ZADD', key, now, member)
  count = count + 1
  redis.call('PEXPIRE', key, windowMs)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2]) or now
  return { 1, max - count, oldestScore }
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2]) or now
  return { 0, 0, oldestScore }
end
`;

async function checkRedis(
  client: RedisClientType,
  key: string,
  windowMs: number,
  max: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const raw = (await client.eval(SLIDING_WINDOW_SCRIPT, {
    keys: [key],
    arguments: [String(now), String(windowMs), String(max), member],
  })) as [number, number, number];

  const allowed = Number(raw[0]) === 1;
  const remaining = Number(raw[1]);
  const oldest = Number(raw[2]);
  const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  return { allowed, remaining, retryAfter, oldest };
}

// ── In-memory fallback (sliding window via sorted array of timestamps) ────────
const memoryStore = new Map<string, number[]>();

function checkMemory(key: string, windowMs: number, max: number): RateLimitResult {
  const now = Date.now();
  const clearBefore = now - windowMs;
  const hits = (memoryStore.get(key) ?? []).filter((t) => t > clearBefore);

  if (hits.length < max) {
    hits.push(now);
    memoryStore.set(key, hits);
    const oldest = hits[0];
    return {
      allowed: true,
      remaining: max - hits.length,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      oldest,
    };
  }

  memoryStore.set(key, hits);
  const oldest = hits[0];
  return {
    allowed: false,
    remaining: 0,
    retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    oldest,
  };
}

// Periodically evict stale in-memory buckets to avoid unbounded growth.
const MEMORY_SWEEP_MS = 60 * 1000;
const memorySweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of memoryStore.entries()) {
    const fresh = hits.filter((t) => t > now - 60 * 60 * 1000);
    if (fresh.length === 0) memoryStore.delete(key);
    else memoryStore.set(key, fresh);
  }
}, MEMORY_SWEEP_MS);
if (typeof memorySweeper.unref === 'function') memorySweeper.unref();

// ── Core sliding-window check ─────────────────────────────────────────────────
async function checkLimit(
  config: RateLimitConfig,
  bucketKey: string
): Promise<RateLimitResult> {
  const key = `rl:${config.name}:${bucketKey}`;
  const client = getRedisClient();
  if (client) {
    try {
      return await checkRedis(client, key, config.windowMs, config.max);
    } catch (err) {
      logger.error(
        `[rate-limit] Redis check failed for ${config.name}: ${err instanceof Error ? err.message : String(err)}`
      );
      logger.warn('[rate-limit] Falling back to in-memory store for this request');
    }
  }
  return checkMemory(key, config.windowMs, config.max);
}

// ── Middleware factory ────────────────────────────────────────────────────────
export function createRateLimiter(config: RateLimitConfig) {
  const keyGenerator = config.keyGenerator ?? ((req: Request) => req.ip ?? 'unknown');

  return async function rateLimiter(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const bucketKey = keyGenerator(req);
    let result: RateLimitResult;
    try {
      result = await checkLimit(config, bucketKey);
    } catch (err) {
      // Fail open: never block traffic because the limiter itself errored.
      logger.error(
        `[rate-limit] Unexpected error in ${config.name}: ${err instanceof Error ? err.message : String(err)}`
      );
      next();
      return;
    }

    res.set('X-RateLimit-Limit', String(config.max));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil((result.oldest + config.windowMs) / 1000)));

    if (!result.allowed) {
      rateLimitHitsTotal.inc({ limiter: config.name, method: req.method });
      logger.warn(
        { ip: req.ip, path: req.path, method: req.method, limiter: config.name },
        '[rate-limit] limit exceeded'
      );
      res.set('Retry-After', String(result.retryAfter));
      res.status(429).json(config.message);
      return;
    }

    next();
  };
}

// ── Per-route configurations ──────────────────────────────────────────────────
const ipKey = (req: Request): string => req.ip ?? 'unknown';
const userKey = (req: Request): string => req.user?.userId ?? req.ip ?? 'unknown';
const clinicKey = (req: Request): string => req.user?.clinicId ?? req.ip ?? 'unknown';

// Auth login: 5 req / 15 min per IP
export const authLimiter = createRateLimiter({
  name: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'TooManyRequests', message: 'Too many login attempts. Try again in 15 minutes.' },
  keyGenerator: ipKey,
});

// Auth register: 3 req / 1 hour per IP
export const registerLimiter = createRateLimiter({
  name: 'auth-register',
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'TooManyRequests', message: 'Too many registration attempts. Try again in 1 hour.' },
  keyGenerator: ipKey,
});

// Forgot-password: 3 req / 1 hour per IP
export const forgotPasswordLimiter = createRateLimiter({
  name: 'forgot-password',
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'TooManyRequests', message: 'Too many password reset requests. Try again in 1 hour.' },
  keyGenerator: ipKey,
});

// Portal MFA (enroll/verify/challenge): 5 req / 15 min per IP
export const mfaLimiter = createRateLimiter({
  name: 'portal-mfa',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'TooManyRequests', message: 'Too many MFA attempts. Try again in 15 minutes.' },
  keyGenerator: ipKey,
});

// AI endpoints: 20 req / 1 min per clinic
export const aiLimiter = createRateLimiter({
  name: 'ai',
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'TooManyRequests', message: 'AI rate limit exceeded. Try again in 1 minute.' },
  keyGenerator: clinicKey,
});

// Payment intent: 20 req / 1 min per clinic
export const paymentLimiter = createRateLimiter({
  name: 'payment',
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'TooManyRequests', message: 'Payment rate limit exceeded. Try again in 1 minute.' },
  keyGenerator: clinicKey,
});

// General: 300 req / 15 min per IP
export const generalLimiter = createRateLimiter({
  name: 'general',
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'TooManyRequests', message: 'Too many requests. Try again in 15 minutes.' },
  keyGenerator: ipKey,
});

// Bulk export: 5 req / 1 hour per user
export const bulkExportLimiter = createRateLimiter({
  name: 'bulk-export',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'TooManyRequests', message: 'Bulk export limit: 5 per hour. Try again later.' },
  keyGenerator: userKey,
});

// Patient search: 100 req / 1 min per user
export const patientSearchLimiter = createRateLimiter({
  name: 'patient-search',
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'TooManyRequests', message: 'Search rate limit exceeded. Try again in 1 minute.' },
  keyGenerator: userKey,
});

// Report generation: 10 req / 1 hour per user
export const reportGenerationLimiter = createRateLimiter({
  name: 'report-generation',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'TooManyRequests', message: 'Report generation limit: 10 per hour. Try again later.' },
  keyGenerator: userKey,
});

// ── Test helpers ──────────────────────────────────────────────────────────────
/** Clears the in-memory fallback store. Intended for tests only. */
export function __resetMemoryStore(): void {
  memoryStore.clear();
}
