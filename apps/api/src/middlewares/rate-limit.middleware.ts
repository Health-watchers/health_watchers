import type { NextFunction, Request, Response } from 'express';
import { createClient, type RedisClientType } from 'redis';
import { Gauge } from 'prom-client';
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

// ── Store backend gauge ───────────────────────────────────────────────────────
// rate_limit_store_backend{type="memory|redis"} — 1 for the active backend.
// Alertmanager fires when type="memory" is observed in production.
export const rateLimitStoreBackendGauge = new Gauge({
  name: 'rate_limit_store_backend',
  help: 'Active rate-limit store backend (1 = active)',
  labelNames: ['type'] as const,
});

function setStoreBackend(backend: 'memory' | 'redis'): void {
  rateLimitStoreBackendGauge.set({ type: 'memory' }, backend === 'memory' ? 1 : 0);
  rateLimitStoreBackendGauge.set({ type: 'redis' }, backend === 'redis' ? 1 : 0);
}

// ── Production fail-closed state ─────────────────────────────────────────────
const isProduction = (): boolean => process.env.NODE_ENV === 'production';

// When true, the instance must be considered unready (Redis store unavailable
// in production). Readiness probes should consult isRateLimitStoreReady().
let storeUnavailable = false;

/** Returns false when the rate-limit store is unusable in production. */
export function isRateLimitStoreReady(): boolean {
  return !storeUnavailable;
}

function markStoreUnavailable(reason: string): void {
  storeUnavailable = true;
  setStoreBackend('memory');
  logger.error(`[rate-limit] Rate-limit store unavailable: ${reason}`);
  if (isProduction()) {
    logger.error(
      '[rate-limit] FAIL CLOSED: Redis store is required in production. Instance will be marked unready.'
    );
  }
}

// ── Redis client (lazy, shared) ───────────────────────────────────────────────
let redisClient: RedisClientType | null = null;
let redisReady = false;

function getRedisClient(): RedisClientType | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    if (isProduction()) {
      markStoreUnavailable('REDIS_URL is not configured');
    } else {
      setStoreBackend('memory');
    }
    return null;
  }

  if (!redisClient) {
    try {
      const client = createClient({ url: redisUrl });
      client.on('error', (err: Error) => {
        redisReady = false;
        logger.error(`[rate-limit] Redis connection error: ${err.message}`);
        if (isProduction()) {
          markStoreUnavailable(`Redis connection error: ${err.message}`);
        } else {
          logger.warn('[rate-limit] Falling back to in-memory store for rate limiting');
          setStoreBackend('memory');
        }
      });
      client.on('ready', () => {
        redisReady = true;
        storeUnavailable = false;
        setStoreBackend('redis');
        logger.info('[rate-limit] Redis sliding-window store ready');
      });
      client.on('end', () => {
        redisReady = false;
        if (isProduction()) {
          markStoreUnavailable('Redis connection ended');
        }
      });
      client.connect().catch((err: Error) => {
        redisReady = false;
        logger.error(`[rate-limit] Failed to connect Redis store: ${err.message}`);
        if (isProduction()) {
          markStoreUnavailable(`Failed to connect Redis store: ${err.message}`);
        } else {
          setStoreBackend('memory');
        }
      });
      redisClient = client as RedisClientType;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[rate-limit] Failed to configure Redis store: ${message}`);
      if (isProduction()) {
        markStoreUnavailable(`Failed to configure Redis store: ${message}`);
        throw new Error(`[rate-limit] Fatal: Redis store required in production: ${message}`);
      }
      logger.warn(
        '[rate-limit] Falling back to in-memory store. Multi-instance deployments are NOT protected.'
      );
      setStoreBackend('memory');
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
// Bounded: capped key count with LRU eviction + per-key TTL pruning. Intended
// for development/test only; production fails closed instead of using this.
const MEMORY_MAX_KEYS = 10_000;
const MEMORY_KEY_TTL_MS = 60 * 60 * 1000;
const memoryStore = new Map<string, number[]>();

function evictMemoryKey(key: string): void {
  memoryStore.delete(key);
}

function checkMemory(key: string, windowMs: number, max: number): RateLimitResult {
  const now = Date.now();
  const clearBefore = now - windowMs;
  const hits = (memoryStore.get(key) ?? []).filter((t) => t > clearBefore);

  if (hits.length < max) {
    hits.push(now);
    // Refresh LRU ordering: delete then re-insert moves key to the end.
    memoryStore.delete(key);
    memoryStore.set(key, hits);
    // Enforce max key count by evicting the least-recently-used keys.
    while (memoryStore.size > MEMORY_MAX_KEYS) {
      const oldestKey = memoryStore.keys().next().value;
      if (oldestKey === undefined) break;
      evictMemoryKey(oldestKey);
    }
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
    const fresh = hits.filter((t) => t > now - MEMORY_KEY_TTL_MS);
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
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[rate-limit] Redis check failed for ${config.name}: ${message}`);
      if (isProduction()) {
        // Fail closed: do not silently fall back to per-process memory.
        markStoreUnavailable(`Redis check failed for ${config.name}: ${message}`);
        throw new Error(`[rate-limit] Redis check failed for ${config.name}: ${message}`);
      }
      logger.warn('[rate-limit] Falling back to in-memory store for this request');
      setStoreBackend('memory');
    }
  } else if (isProduction()) {
    // No usable Redis client in production: fail closed.
    markStoreUnavailable('No Redis client available');
    throw new Error('[rate-limit] Redis store unavailable in production');
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
      logger.error(
        `[rate-limit] Unexpected error in ${config.name}: ${err instanceof Error ? err.message : String(err)}`
      );
      if (isProduction()) {
        // Fail closed in production: refuse the request rather than bypassing
        // the security control when the shared store is unavailable.
        res.set('Retry-After', '30');
        res.status(503).json({
          error: 'ServiceUnavailable',
          message: 'Rate limiting temporarily unavailable. Try again shortly.',
        });
        return;
      }
      // Fail open in non-production: never block local traffic on limiter errors.
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

/** Resets the production fail-closed flag. Intended for tests only. */
export function __resetStoreState(): void {
  storeUnavailable = false;
}
