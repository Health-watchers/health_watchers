import Redis from 'ioredis';
import logger from '../utils/logger';

// ── Metrics ───────────────────────────────────────────────────────────────────
let hits = 0;
let misses = 0;

export function getCacheMetrics() {
  const total = hits + misses;
  return { hits, misses, hitRate: total === 0 ? 0 : +(hits / total).toFixed(4) };
}

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

  async delPattern(pattern: string): Promise<void> {
    const redis = getClient();
    if (!redis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    } catch (err) {
      logger.warn({ err, pattern }, '[cache] delPattern error');
    }
  },
};
