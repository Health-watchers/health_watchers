/**
 * ShardingService — Issue #1077
 *
 * Provides shard routing, health-checking, and rebalancing for the
 * Health Watchers database sharding strategy.
 *
 * Strategy   : SHA-256 hashed shard keys (clinic-affinity, patient-affinity,
 *               time-range for audit/communication logs).
 * Shard count : 4 (configurable via SHARDING_STRATEGIES).
 * Failover   : Marks unavailable shards, redirects to healthy replicas.
 */

import crypto from 'crypto';
import logger from '../utils/logger';
import {
  SHARD_SERVERS,
  SHARDING_STRATEGIES,
  getShardMapping,
  type ShardInfo,
  type ShardingConfig,
} from '../config/sharding-strategy';

export interface ShardRouteResult {
  shardId: string;
  connectionString: string;
  shardName: string;
}

export interface ShardHealthStatus {
  healthy: ShardInfo[];
  degraded: ShardInfo[];
  unavailable: ShardInfo[];
  totalShards: number;
  healthyCount: number;
}

export interface ShardBalanceReport {
  collection: string;
  shards: Array<{
    shardName: string;
    documentCount: number;
    dataSize: number;
    percentage: number;
  }>;
  imbalance: number;
  needsRebalance: boolean;
}

/**
 * Compute SHA-256 hash of a string and return a hex digest.
 */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Determine which shard index (0-based) a given key maps to.
 */
function computeShardIndex(key: string, shardCount: number, config: ShardingConfig): number {
  switch (config.shardKeyType) {
    case 'hashed': {
      const hash = sha256(key);
      // Take first 8 hex chars → 32-bit integer, mod shardCount
      const numeric = parseInt(hash.substring(0, 8), 16);
      return numeric % shardCount;
    }

    case 'range': {
      if (!config.rangeDistribution) {
        throw new Error('rangeDistribution is required for range sharding');
      }
      // For date-based range sharding (month 0-11)
      const numericKey = typeof key === 'string' ? parseInt(key, 10) : Number(key);
      const range = config.rangeDistribution.ranges.find(
        (r) => numericKey >= r.start && numericKey < r.end,
      );
      if (range) {
        // "shard-N" → extract N and return 0-based index
        const shardNum = parseInt(range.shard.replace('shard-', ''), 10);
        return (shardNum - 1) % shardCount;
      }
      return numericKey % shardCount;
    }

    case 'directory':
      // Directory sharding falls back to hash-based routing
      return parseInt(sha256(key).substring(0, 8), 16) % shardCount;

    default:
      return 0;
  }
}

/**
 * ShardingService — singleton responsible for all shard-routing decisions.
 */
export class ShardingService {
  private static instance: ShardingService;
  private shards: Map<string, ShardInfo> = new Map();

  private constructor() {
    for (const shard of SHARD_SERVERS) {
      this.shards.set(shard.shardName, { ...shard });
    }
    logger.info({ shardCount: this.shards.size }, 'ShardingService initialised');
  }

  static getInstance(): ShardingService {
    if (!ShardingService.instance) {
      ShardingService.instance = new ShardingService();
    }
    return ShardingService.instance;
  }

  /**
   * Determine which shard should handle a document from the given collection
   * using the document's shard-key value.
   */
  getShardForDocument(collectionName: string, shardKeyValue: unknown): ShardRouteResult {
    const config = SHARDING_STRATEGIES[collectionName];
    if (!config) {
      // Default to shard-1 for unmapped collections
      const defaultShard = this.shards.get('shard-1')!;
      return {
        shardId: 'shard-1',
        connectionString: defaultShard.connectionString,
        shardName: defaultShard.shardName,
      };
    }

    const key =
      config.shardKeyType === 'range' && shardKeyValue instanceof Date
        ? String(shardKeyValue.getMonth())
        : String(shardKeyValue);

    const shardIndex = computeShardIndex(key, config.shardCount, config);
    const shardName = `shard-${shardIndex + 1}`;

    const shard = this.shards.get(shardName);
    if (!shard || shard.status === 'unavailable') {
      return this._fallbackShard(collectionName, shardKeyValue);
    }

    return {
      shardId: shardName,
      connectionString: shard.connectionString,
      shardName: shard.shardName,
    };
  }

  /**
   * Return an overall health summary for all known shards.
   */
  getShardHealth(): ShardHealthStatus {
    const healthy: ShardInfo[] = [];
    const degraded: ShardInfo[] = [];
    const unavailable: ShardInfo[] = [];

    for (const shard of this.shards.values()) {
      switch (shard.status) {
        case 'active':
          healthy.push(shard);
          break;
        case 'recovering':
          degraded.push(shard);
          break;
        case 'unavailable':
          unavailable.push(shard);
          break;
      }
    }

    return {
      healthy,
      degraded,
      unavailable,
      totalShards: this.shards.size,
      healthyCount: healthy.length,
    };
  }

  /**
   * Update the runtime status of a shard (e.g. after a health-check ping).
   */
  updateShardStatus(shardName: string, status: ShardInfo['status']): void {
    const shard = this.shards.get(shardName);
    if (shard) {
      shard.status = status;
      shard.lastHealthCheck = new Date();
      logger.info({ shardName, status }, 'Shard status updated');
    }
  }

  /**
   * Perform health-check pings against all configured shards and update their
   * statuses in-memory.  Returns the updated health summary.
   */
  async performHealthChecks(): Promise<ShardHealthStatus> {
    const checks = Array.from(this.shards.values()).map(async (shard) => {
      const start = Date.now();
      try {
        // Lightweight connectivity test — try creating a transient connection
        const { MongoClient } = await import('mongodb');
        const client = new MongoClient(shard.connectionString, {
          connectTimeoutMS: 3000,
          serverSelectionTimeoutMS: 3000,
        });
        await client.connect();
        await client.db('admin').command({ ping: 1 });
        await client.close();

        this.updateShardStatus(shard.shardName, 'active');
        logger.debug(
          { shardName: shard.shardName, latencyMs: Date.now() - start },
          'Shard health-check passed',
        );
      } catch (error) {
        logger.warn(
          { shardName: shard.shardName, error: (error as Error).message },
          'Shard health-check failed — marking unavailable',
        );
        this.updateShardStatus(shard.shardName, 'unavailable');
      }
    });

    await Promise.allSettled(checks);
    return this.getShardHealth();
  }

  /**
   * Generate a balance report for a collection, using the stored document-
   * count metrics on each ShardInfo.
   */
  getBalanceReport(collectionName: string): ShardBalanceReport {
    const mapping = getShardMapping(collectionName);
    if (!mapping) {
      return {
        collection: collectionName,
        shards: [],
        imbalance: 0,
        needsRebalance: false,
      };
    }

    const config = mapping.config;
    const totalDocs = Array.from(mapping.shards.values()).reduce(
      (sum, s) => sum + s.documentCount,
      0,
    );

    const shards = Array.from(mapping.shards.values()).map((s) => ({
      shardName: s.shardName,
      documentCount: s.documentCount,
      dataSize: s.dataSize,
      percentage: totalDocs > 0 ? (s.documentCount / totalDocs) * 100 : 0,
    }));

    const percentages = shards.map((s) => s.percentage);
    const maxPct = Math.max(...percentages);
    const minPct = Math.min(...percentages);
    const imbalance = maxPct - minPct;
    const threshold = config.balanceThreshold ?? 15;

    return {
      collection: collectionName,
      shards,
      imbalance: parseFloat(imbalance.toFixed(2)),
      needsRebalance: imbalance > threshold,
    };
  }

  /**
   * Return all configured collections and their sharding configurations.
   */
  getShardingStrategy(): Record<string, ShardingConfig> {
    return { ...SHARDING_STRATEGIES };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Find a healthy fallback shard when the preferred shard is unavailable.
   */
  private _fallbackShard(collectionName: string, shardKeyValue: unknown): ShardRouteResult {
    const activeShard = Array.from(this.shards.values()).find(
      (s) => s.status === 'active' || s.status === 'recovering',
    );

    if (!activeShard) {
      // All shards down — last resort: return shard-1 config regardless
      const defaultShard = SHARD_SERVERS[0];
      logger.error(
        { collectionName, shardKeyValue },
        'All shards unavailable — using shard-1 as emergency fallback',
      );
      return {
        shardId: 'shard-1',
        connectionString: defaultShard.connectionString,
        shardName: defaultShard.shardName,
      };
    }

    logger.warn(
      { collectionName, fallbackShard: activeShard.shardName },
      'Primary shard unavailable — rerouting to fallback',
    );

    return {
      shardId: activeShard.shardName,
      connectionString: activeShard.connectionString,
      shardName: activeShard.shardName,
    };
  }
}

export default ShardingService;
