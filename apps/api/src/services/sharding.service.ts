import crypto from 'crypto';
import {
  getShardingConfig,
  getShardMapping,
  type ShardKeyValue,
  type ShardInfo,
} from '../config/sharding-strategy';
import logger from '../lib/logger';

export class ShardingService {
  determineShardForDocument(collectionName: string, document: any): ShardInfo | undefined {
    const config = getShardingConfig(collectionName);
    const mapping = getShardMapping(collectionName);

    if (!config || !mapping) {
      logger.warn(`No sharding config for collection: ${collectionName}`);
      return undefined;
    }

    const shardKeyValue = this.extractShardKey(document, config.shardKeyPath);
    const shardId = this.computeShardId(shardKeyValue, config);

    return Array.from(mapping.shards.values()).find((shard) => shard.shardName === shardId);
  }

  private extractShardKey(document: any, keyPath: string): any {
    const keys = keyPath.split('.');
    let value = document;

    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return null;
      }
    }

    return value;
  }

  private computeShardId(keyValue: any, config: any): string {
    if (config.shardKeyType === 'hashed') {
      return this.hashBasedSharding(keyValue, config);
    } else if (config.shardKeyType === 'range') {
      return this.rangeBasedSharding(keyValue, config);
    } else if (config.shardKeyType === 'directory') {
      return this.directoryBasedSharding(keyValue, config);
    }

    throw new Error(`Unknown shard key type: ${config.shardKeyType}`);
  }

  private hashBasedSharding(keyValue: any, config: any): string {
    const keyStr = keyValue.toString();
    const hash = this.hashValue(keyStr, config.hashFunction || 'sha256');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const shardIndex = Math.abs(hashInt) % config.shardCount;

    return `shard-${shardIndex + 1}`;
  }

  private rangeBasedSharding(keyValue: any, config: any): string {
    if (!config.rangeDistribution || !config.rangeDistribution.ranges) {
      throw new Error('Range distribution not configured');
    }

    let value: number;

    if (keyValue instanceof Date) {
      const month = keyValue.getMonth();
      value = month;
    } else {
      value = Number(keyValue);
    }

    const range = config.rangeDistribution.ranges.find(
      (r: any) => value >= r.start && value <= r.end
    );

    if (!range) {
      // Default to first shard if outside range
      return config.rangeDistribution.ranges[0].shard;
    }

    return range.shard;
  }

  private directoryBasedSharding(keyValue: any, config: any): string {
    if (!config.directory || typeof config.directory !== 'object') {
      throw new Error('Directory not configured');
    }

    const mapped = config.directory[keyValue.toString()];

    if (!mapped) {
      throw new Error(`No shard mapping found for key: ${keyValue}`);
    }

    return mapped;
  }

  private hashValue(value: string, hashFunction: string): string {
    const algorithm = hashFunction || 'sha256';
    return crypto.createHash(algorithm).update(value).digest('hex');
  }

  getShardDistribution(collectionName: string): Record<string, number> {
    const mapping = getShardMapping(collectionName);

    if (!mapping) {
      return {};
    }

    const distribution: Record<string, number> = {};

    for (const [shardName, shardInfo] of mapping.shards.entries()) {
      distribution[shardName] = shardInfo.documentCount;
    }

    return distribution;
  }

  checkShardBalance(collectionName: string): {
    balanced: boolean;
    imbalancePercentage: number;
    recommendation?: string;
  } {
    const config = getShardingConfig(collectionName);
    const mapping = getShardMapping(collectionName);

    if (!config || !mapping) {
      return { balanced: true, imbalancePercentage: 0 };
    }

    const shards = Array.from(mapping.shards.values());
    const totalDocs = shards.reduce((sum, s) => sum + s.documentCount, 0);

    if (totalDocs === 0) {
      return { balanced: true, imbalancePercentage: 0 };
    }

    const avgDocsPerShard = totalDocs / shards.length;
    const maxDeviation = Math.max(
      ...shards.map((s) => Math.abs(s.documentCount - avgDocsPerShard))
    );

    const imbalancePercentage = (maxDeviation / avgDocsPerShard) * 100;
    const threshold = config.balanceThreshold || 15;

    return {
      balanced: imbalancePercentage <= threshold,
      imbalancePercentage,
      recommendation:
        imbalancePercentage > threshold
          ? `Consider rebalancing shards. Imbalance: ${imbalancePercentage.toFixed(2)}%`
          : undefined,
    };
  }

  async getShardHealth(): Promise<{
    healthy: boolean;
    shards: Array<{
      name: string;
      status: string;
      responsiveness: boolean;
    }>;
  }> {
    // This would need actual shard health checks
    // Placeholder implementation
    return {
      healthy: true,
      shards: [],
    };
  }

  generateMigrationPlan(
    collectionName: string,
    targetShardCount: number
  ): {
    currentShardCount: number;
    targetShardCount: number;
    affectedDocuments: number;
    estimatedTime: string;
    steps: string[];
  } {
    const config = getShardingConfig(collectionName);
    const mapping = getShardMapping(collectionName);

    if (!config || !mapping) {
      throw new Error(`No sharding config for collection: ${collectionName}`);
    }

    const totalDocs = Array.from(mapping.shards.values()).reduce(
      (sum, s) => sum + s.documentCount,
      0
    );

    const docsPerShard = Math.ceil(totalDocs / targetShardCount);
    const estimatedTimeMinutes = Math.ceil(totalDocs / 10000); // Rough estimate: 10k docs/min

    return {
      currentShardCount: config.shardCount,
      targetShardCount,
      affectedDocuments: totalDocs,
      estimatedTime: `${estimatedTimeMinutes} minutes`,
      steps: [
        'Create new shards',
        'Configure shard ranges',
        'Enable balancer',
        'Monitor chunk migration',
        'Verify data consistency',
        'Update shard configuration',
      ],
    };
  }

  getShardingMetrics(
    collectionName: string
  ): {
    shardCount: number;
    totalDocuments: number;
    totalDataSize: number;
    avgDocsPerShard: number;
    avgSizePerShard: string;
    imbalance: string;
  } {
    const mapping = getShardMapping(collectionName);

    if (!mapping) {
      return {
        shardCount: 0,
        totalDocuments: 0,
        totalDataSize: 0,
        avgDocsPerShard: 0,
        avgSizePerShard: '0 MB',
        imbalance: 'N/A',
      };
    }

    const shards = Array.from(mapping.shards.values());
    const totalDocs = shards.reduce((sum, s) => sum + s.documentCount, 0);
    const totalSize = shards.reduce((sum, s) => sum + s.dataSize, 0);

    const balance = this.checkShardBalance(collectionName);

    return {
      shardCount: shards.length,
      totalDocuments: totalDocs,
      totalDataSize: totalSize,
      avgDocsPerShard: Math.round(totalDocs / shards.length),
      avgSizePerShard: this.formatBytes(totalSize / shards.length),
      imbalance: `${balance.imbalancePercentage.toFixed(2)}%`,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export const shardingService = new ShardingService();
