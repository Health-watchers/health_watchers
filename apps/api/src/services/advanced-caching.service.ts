import zlib from 'zlib';
import { promisify } from 'util';
import logger from '../utils/logger';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface CacheConfig {
  ttlSeconds: number;
  compression?: boolean;
  stampedeLockMs?: number;
}

export interface CacheEntry<T = unknown> {
  value: T;
  timestamp: number;
  hits: number;
  size: number;
  compressed?: boolean;
}

export interface CacheMetrics {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  avgValueSize: number;
  totalSize: number;
  compressionRatio: number;
}

const STAMPED_LOCK_PREFIX = '__lock:';
const DEFAULT_STAMPED_LOCK_MS = 1000;
const COMPRESSION_THRESHOLD = 1024; // Compress values > 1KB

export class AdvancedCachingService {
  private cache: Map<string, CacheEntry> = new Map();
  private stampedeLocks: Map<string, number> = new Map();
  private compressionStats = {
    compressed: 0,
    uncompressed: 0,
    totalCompressed: 0,
    totalOriginal: 0,
  };

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    entry.hits++;
    let value = entry.value;

    // Decompress if needed
    if (entry.compressed && typeof entry.value === 'string') {
      try {
        const buffer = Buffer.from(entry.value, 'base64');
        const decompressed = await gunzip(buffer);
        value = JSON.parse(decompressed.toString('utf-8'));
      } catch (err) {
        logger.warn({ err, key }, '[cache] Failed to decompress value');
        this.cache.delete(key);
        return null;
      }
    }

    return value as T;
  }

  async set<T>(key: string, value: T, config: CacheConfig): Promise<void> {
    try {
      let finalValue: unknown = value;
      let compressed = false;
      const serialized = JSON.stringify(value);
      let size = Buffer.byteLength(serialized, 'utf-8');

      // Compress if enabled and value is large
      if (config.compression && size > COMPRESSION_THRESHOLD) {
        try {
          const compressed_data = await gzip(serialized);
          const base64 = compressed_data.toString('base64');
          if (base64.length < serialized.length) {
            finalValue = base64;
            compressed = true;
            this.compressionStats.compressed++;
            this.compressionStats.totalCompressed += compressed_data.length;
            this.compressionStats.totalOriginal += size;
            size = base64.length;
          } else {
            this.compressionStats.uncompressed++;
          }
        } catch (err) {
          logger.warn({ err, key }, '[cache] Compression failed, storing uncompressed');
          this.compressionStats.uncompressed++;
        }
      }

      this.cache.set(key, {
        value: finalValue,
        timestamp: Date.now(),
        hits: 0,
        size,
        compressed,
      });

      // Clear stamped lock after value is set
      this.stampedeLocks.delete(STAMPED_LOCK_PREFIX + key);
    } catch (err) {
      logger.error({ err, key }, '[cache] Failed to set value');
      throw err;
    }
  }

  async getWithStampedeLock<T>(
    key: string,
    loader: () => Promise<T>,
    config: CacheConfig
  ): Promise<T> {
    // Return cached value if available
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const lockKey = STAMPED_LOCK_PREFIX + key;
    const stampedeLockMs = config.stampedeLockMs ?? DEFAULT_STAMPED_LOCK_MS;
    const now = Date.now();

    // Check if another request is already loading
    const lockTime = this.stampedeLocks.get(lockKey);
    if (lockTime && now - lockTime < stampedeLockMs) {
      // Wait briefly for the other request to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retried = await this.get<T>(key);
      if (retried !== null) {
        return retried;
      }
    }

    // Set lock and load value
    this.stampedeLocks.set(lockKey, now);
    try {
      const value = await loader();
      await this.set(key, value, config);
      return value;
    } catch (err) {
      this.stampedeLocks.delete(lockKey);
      throw err;
    }
  }

  delete(key: string): boolean {
    this.stampedeLocks.delete(STAMPED_LOCK_PREFIX + key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.stampedeLocks.clear();
    logger.info('[cache] Cache cleared');
  }

  getMetrics(): CacheMetrics {
    const entries = Array.from(this.cache.values());
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    const totalMisses = Math.max(1, this.cache.size - totalHits); // Estimate

    const compressionRatio =
      this.compressionStats.totalOriginal > 0
        ? (
            ((this.compressionStats.totalOriginal - this.compressionStats.totalCompressed) /
              this.compressionStats.totalOriginal) *
            100
          ).toFixed(2)
        : 0;

    return {
      totalHits,
      totalMisses,
      hitRate: this.cache.size > 0 ? totalHits / this.cache.size : 0,
      avgValueSize: this.cache.size > 0 ? Math.round(totalSize / this.cache.size) : 0,
      totalSize,
      compressionRatio: parseFloat(compressionRatio as string),
    };
  }

  getDebugInfo() {
    return {
      cacheSize: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        hits: entry.hits,
        size: entry.size,
        compressed: entry.compressed,
        age: Date.now() - entry.timestamp,
      })),
      locks: this.stampedeLocks.size,
      metrics: this.getMetrics(),
      compressionStats: this.compressionStats,
    };
  }

  // Evict least recently used entries
  evict(maxEntries = 1000): number {
    if (this.cache.size <= maxEntries) {
      return 0;
    }

    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].hits - b[1].hits)
      .slice(0, this.cache.size - maxEntries);

    let evicted = 0;
    for (const [key] of entries) {
      if (this.cache.delete(key)) {
        evicted++;
      }
    }

    logger.info({ evicted, remaining: this.cache.size }, '[cache] LRU eviction completed');
    return evicted;
  }
}

export const advancedCaching = new AdvancedCachingService();
