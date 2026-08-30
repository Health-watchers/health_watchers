import Redis from 'ioredis';
import logger from '../utils/logger';

// ── Metrics ───────────────────────────────────────────────────────────────────
let hits = 0;
let misses = 0;

/** Reset hit / miss counters (useful for tests). */
export function resetCacheMetrics(): void {
  hits = 0;
  misses = 0;
}

export function getCacheMetrics() {
  const total = hits + misses;
  return { hits, misses, hitRate: total === 0 ? 0 : +(hits / total).toFixed(4) };
}

// Log hit-rate summary every 5 minutes so it shows up in Grafana / CloudWatch.
const HIT_RATE_LOG_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const metrics = getCacheMetrics();
  logger.info(
    { cacheHits: metrics.hits, cacheMisses: metrics.misses, cacheHitRate: metrics.hitRate },
    '[cache] hit-rate report'
  );
}, HIT_RATE_LOG_INTERVAL_MS).unref(); // .unref() so the timer doesn't keep the process alive

// ── Client ────────────────────────────────────────────────────────────────────
let client: Redis | null = null;

function getClient(): Redis | null {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;

  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  client.on('error', (err) => {
    logger.warn({ err }, '[cache] Redis error — falling through to DB');
  });

  return client;
}

// ── Warm-up registry ──────────────────────────────────────────────────────────
export interface WarmupEntry<T = unknown> {
  key: string;
  ttlSeconds: number;
  /** Async factory that returns the value to cache. */
  loader: () => Promise<T>;
}

const warmupRegistry: WarmupEntry[] = [];

/**
 * Register a key + loader for cache warming.
 * Call this at application startup for frequently accessed, slow-to-compute data.
 */
export function registerWarmup<T>(entry: WarmupEntry<T>): void {
  warmupRegistry.push(entry as WarmupEntry);
}

/**
 * Warm the cache by running all registered loaders that are currently missing.
 * Safe to call on startup — each loader is only executed if the key is absent.
 */
export async function warmCache(): Promise<void> {
  const redis = getClient();
  if (!redis) {
    logger.warn('[cache] warmCache skipped — Redis not configured');
    return;
  }

  const results = await Promise.allSettled(
    warmupRegistry.map(async ({ key, ttlSeconds, loader }) => {
      try {
        // Only fill the cache if the key is missing (don't evict a fresh value)
        const existing = await redis.exists(key);
        if (existing) {
          logger.debug({ key }, '[cache] warmup skipped — key already present');
          return;
        }
        const value = await loader();
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        logger.info({ key, ttlSeconds }, '[cache] warmed');
      } catch (err) {
        logger.warn({ err, key }, '[cache] warmup failed — continuing');
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.warn({ failed, total: warmupRegistry.length }, '[cache] some warmup entries failed');
  }
}

// ── Service ───────────────────────────────────────────────────────────────────
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const redis = getClient();
    if (!redis) {
      misses++;
      return null;
    }
    try {
      const raw = await redis.get(key);
      if (raw === null) {
        misses++;
        logger.debug({ key }, '[cache] miss');
        return null;
      }
      hits++;
      logger.debug({ key }, '[cache] hit');
      return JSON.parse(raw) as T;
    } catch (err) {
      misses++;
      logger.warn({ err, key }, '[cache] get error — falling through');
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = getClient();
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, '[cache] set error');
    }
  },

  async del(key: string): Promise<void> {
    const redis = getClient();
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn({ err, key }, '[cache] del error');
    }
  },

  /**
   * Delete all keys matching a glob pattern.
   * Use structured key prefixes (e.g. `patients:list:<clinicId>:*`) to keep
   * KEYS calls fast and to avoid full-keyspace scans in production.
   */
  async delPattern(pattern: string): Promise<void> {
    const redis = getClient();
    if (!redis) return;
    try {
      // Use SCAN instead of KEYS to avoid blocking the Redis event loop on large keyspaces
      let cursor = '0';
      const keysToDelete: string[] = [];
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        // Pipeline the DEL calls in chunks of 500 to avoid oversized commands
        const CHUNK = 500;
        for (let i = 0; i < keysToDelete.length; i += CHUNK) {
          await redis.del(...keysToDelete.slice(i, i + CHUNK));
        }
        logger.debug({ pattern, deleted: keysToDelete.length }, '[cache] delPattern completed');
      }
    } catch (err) {
      logger.warn({ err, pattern }, '[cache] delPattern error');
    }
  },

  /**
   * Invalidate all cached patient list pages for a clinic.
   * Call this whenever a patient is created, updated, or deleted.
   */
  async invalidatePatientList(clinicId: string): Promise<void> {
    await cache.delPattern(`patients:list:${clinicId}:*`);
    logger.debug({ clinicId }, '[cache] patient list invalidated');
  },

  /**
   * Invalidate all report cache entries for a clinic.
   * Call this after bulk data changes that would affect aggregate reports.
   */
  async invalidateReports(clinicId: string): Promise<void> {
    await cache.delPattern(`${clinicId}:GET:/reports/*`);
    logger.debug({ clinicId }, '[cache] reports invalidated');
  },

  /**
   * Atomically increment a counter and (on first write) set its TTL.
   * Returns the new value, or `null` when Redis is unavailable so callers
   * can fall back to a local strategy. Used by the per-API-key rate limiter.
   */
  async incr(key: string, ttlSeconds: number): Promise<number | null> {
    const redis = getClient();
    if (!redis) return null;
    try {
      const value = await redis.incr(key);
      if (value === 1) await redis.expire(key, ttlSeconds);
      return value;
    } catch (err) {
      logger.warn({ err, key }, '[cache] incr error');
      return null;
    }
  },

  async ping(): Promise<{ status: string; latency?: number }> {
    const redis = getClient();
    if (!redis) return { status: 'disabled' };
    try {
      const start = Date.now();
      await redis.ping();
      return { status: 'healthy', latency: Date.now() - start };
    } catch (err) {
      return { status: 'unhealthy' };
    }
  },
};
