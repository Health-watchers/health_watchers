/**
 * MongoDB Replica Set Configuration and Replication Optimization
 * Handles read preferences, replication lag monitoring, and failover strategies
 */

import mongoose from 'mongoose';
import logger from '../utils/logger';
import { config } from '@health-watchers/config';

/**
 * Read preference modes for optimal query routing
 */
export type ReadPreference =
  | 'primary'
  | 'primaryPreferred'
  | 'secondary'
  | 'secondaryPreferred'
  | 'nearest';

export interface ReplicationConfig {
  readPreference: ReadPreference;
  readPreferenceTags?: Array<Record<string, string>>;
  w?: number | 'majority'; // Write concern
  j?: boolean; // Journal
  maxStalenessSeconds?: number;
  retryWrites?: boolean;
}

/**
 * Default replication configuration
 */
export const DEFAULT_REPLICATION_CONFIG: ReplicationConfig = {
  readPreference: 'secondaryPreferred',
  w: 'majority',
  j: true,
  retryWrites: true,
  maxStalenessSeconds: 120,
};

/**
 * Read preference configurations for different use cases
 */
export const READ_PREFERENCES = {
  // Critical operations requiring consistent reads
  consistent: {
    readPreference: 'primary',
    w: 'majority',
    j: true,
  } as ReplicationConfig,

  // High-priority operations
  highPriority: {
    readPreference: 'primaryPreferred',
    w: 'majority',
    j: true,
  } as ReplicationConfig,

  // General purpose - balance consistency and scalability
  balanced: {
    readPreference: 'secondaryPreferred',
    w: 'majority',
    j: true,
    maxStalenessSeconds: 120,
  } as ReplicationConfig,

  // Read-heavy analytics - can tolerate some staleness
  analytics: {
    readPreference: 'secondary',
    w: 1,
    j: false,
    maxStalenessSeconds: 300,
  } as ReplicationConfig,

  // Nearest node - lowest latency
  lowest_latency: {
    readPreference: 'nearest',
    w: 1,
  } as ReplicationConfig,
};

/**
 * Replication lag metrics
 */
export interface ReplicationLagMetrics {
  primary: {
    host: string;
    optime: Date;
  };
  secondaries: Array<{
    host: string;
    optime: Date;
    lagMs: number;
  }>;
  maxLagMs: number;
  avgLagMs: number;
  timestamp: Date;
}

/**
 * Get current replication lag metrics
 */
export async function getReplicationLagMetrics(): Promise<ReplicationLagMetrics | null> {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const status = await db.admin().replSetGetStatus();

    if (!status || !status.members) {
      logger.warn('Replication status unavailable');
      return null;
    }

    // Find primary
    const primary = status.members.find((m: any) => m.state === 1);
    if (!primary) {
      logger.warn('No primary found in replica set');
      return null;
    }

    // Calculate lag for each secondary
    const secondaries = status.members
      .filter((m: any) => m.state === 2) // Secondary state
      .map((m: any) => {
        const lagMs = primary.optime.ts.getTime() - m.optime.ts.getTime();
        return {
          host: m.name,
          optime: m.optime.ts,
          lagMs: Math.max(0, lagMs),
        };
      });

    const lags = secondaries.map((s) => s.lagMs);
    const maxLagMs = Math.max(...lags, 0);
    const avgLagMs = lags.length > 0 ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;

    return {
      primary: {
        host: primary.name,
        optime: primary.optime.ts,
      },
      secondaries,
      maxLagMs,
      avgLagMs,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get replication lag metrics');
    return null;
  }
}

/**
 * Monitor replication consistency
 */
export interface ConsistencyMetrics {
  isHealthy: boolean;
  totalMembers: number;
  healthyMembers: number;
  unhealthyMembers: Array<{
    host: string;
    state: string;
    health: number;
  }>;
  primaryHealth: boolean;
  electionInProgress: boolean;
  timestamp: Date;
}

export async function monitorConsistency(): Promise<ConsistencyMetrics | null> {
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const status = await db.admin().replSetGetStatus();

    if (!status) {
      return {
        isHealthy: false,
        totalMembers: 0,
        healthyMembers: 0,
        unhealthyMembers: [],
        primaryHealth: false,
        electionInProgress: false,
        timestamp: new Date(),
      };
    }

    const unhealthyMembers = status.members
      .filter((m: any) => m.health !== 1)
      .map((m: any) => ({
        host: m.name,
        state: m.stateStr || 'UNKNOWN',
        health: m.health,
      }));

    const healthyCount = status.members.filter((m: any) => m.health === 1).length;
    const primaryExists = status.members.some((m: any) => m.state === 1);

    return {
      isHealthy: unhealthyMembers.length === 0 && primaryExists,
      totalMembers: status.members.length,
      healthyMembers: healthyCount,
      unhealthyMembers,
      primaryHealth: primaryExists,
      electionInProgress: status.members.some((m: any) => m.state === 7), // Secondary (hidden)
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error({ error }, 'Failed to monitor consistency');
    return null;
  }
}

/**
 * Test failover by checking replica set connectivity
 */
export interface FailoverTestResult {
  success: boolean;
  replicationDelay: number;
  members: Array<{
    host: string;
    accessible: boolean;
    responseTimeMs: number;
  }>;
  timestamp: Date;
}

export async function testFailover(): Promise<FailoverTestResult> {
  const start = Date.now();
  const db = mongoose.connection.db;
  const results = {
    success: true,
    replicationDelay: 0,
    members: [] as Array<{
      host: string;
      accessible: boolean;
      responseTimeMs: number;
    }>,
    timestamp: new Date(),
  };

  try {
    if (!db) throw new Error('Database not connected');

    const status = await db.admin().replSetGetStatus();
    if (!status) throw new Error('Unable to get replica set status');

    // Test each member
    for (const member of status.members || []) {
      const memberStart = Date.now();
      try {
        const memberUri = `mongodb://${member.name.split(':')[0]}:27017/admin`;
        const memberConnection = new mongoose.Mongoose();

        await memberConnection.connect(memberUri, {
          connectTimeoutMS: 5000,
          serverSelectionTimeoutMS: 5000,
        });

        const responseTimeMs = Date.now() - memberStart;
        results.members.push({
          host: member.name,
          accessible: true,
          responseTimeMs,
        });

        await memberConnection.disconnect();
      } catch (error) {
        const responseTimeMs = Date.now() - memberStart;
        results.members.push({
          host: member.name,
          accessible: false,
          responseTimeMs,
        });
        results.success = false;
      }
    }

    results.replicationDelay = Date.now() - start;
  } catch (error) {
    logger.error({ error }, 'Failover test failed');
    results.success = false;
  }

  return results;
}

/**
 * Configure read preferences on connection
 */
export function configureReadPreferences(
  readPref: ReplicationConfig = DEFAULT_REPLICATION_CONFIG
): void {
  const connection = mongoose.connection;

  // Set read preference at connection level
  connection.setOptions({
    readPreference: readPref.readPreference,
    maxStalenessSeconds: readPref.maxStalenessSeconds,
    readPreferenceTags: readPref.readPreferenceTags,
    w: readPref.w,
    j: readPref.j,
    retryWrites: readPref.retryWrites,
  });

  logger.info(
    { readPreference: readPref.readPreference, w: readPref.w },
    'Read preferences configured'
  );
}

/**
 * Start monitoring replication health
 */
let monitoringInterval: NodeJS.Timeout | null = null;

export function startReplicationMonitoring(intervalMs: number = 30000): void {
  if (monitoringInterval) return;

  monitoringInterval = setInterval(async () => {
    try {
      const lagMetrics = await getReplicationLagMetrics();
      const consistency = await monitorConsistency();

      if (lagMetrics && lagMetrics.maxLagMs > 5000) {
        logger.warn(
          { maxLagMs: lagMetrics.maxLagMs, avgLagMs: lagMetrics.avgLagMs },
          'High replication lag detected'
        );
      }

      if (consistency && !consistency.isHealthy) {
        logger.error(
          { unhealthyMembers: consistency.unhealthyMembers },
          'Replication consistency issues detected'
        );
      }
    } catch (error) {
      logger.error({ error }, 'Replication monitoring error');
    }
  }, intervalMs);

  monitoringInterval.unref();
  logger.info({ intervalMs }, 'Replication monitoring started');
}

export function stopReplicationMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('Replication monitoring stopped');
  }
}

/**
 * Get comprehensive replication health status
 */
export interface ReplicationHealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  lagMetrics: ReplicationLagMetrics | null;
  consistency: ConsistencyMetrics | null;
  issues: string[];
}

export async function getReplicationHealthStatus(): Promise<ReplicationHealthStatus> {
  const lagMetrics = await getReplicationLagMetrics();
  const consistency = await monitorConsistency();
  const issues: string[] = [];
  let status: 'healthy' | 'degraded' | 'critical' = 'healthy';

  if (!consistency?.isHealthy) {
    issues.push('Consistency check failed');
    status = 'critical';
  }

  if (!consistency?.primaryHealth) {
    issues.push('No primary available');
    status = 'critical';
  }

  if (lagMetrics && lagMetrics.maxLagMs > 10000) {
    issues.push(`High replication lag: ${lagMetrics.maxLagMs}ms`);
    status = status === 'critical' ? 'critical' : 'degraded';
  }

  if (consistency && consistency.healthyMembers < 3) {
    issues.push(`Only ${consistency.healthyMembers} healthy members`);
    status = status === 'critical' ? 'critical' : 'degraded';
  }

  return {
    status,
    lagMetrics,
    consistency,
    issues,
  };
}
