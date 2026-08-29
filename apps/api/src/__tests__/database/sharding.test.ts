/**
 * Unit tests for ShardingService — Issue #1077
 */

jest.mock('../../utils/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Prevent real MongoClient connections inside performHealthChecks
jest.mock('mongodb', () => {
  const actual = jest.requireActual('mongodb');
  return {
    ...actual,
    MongoClient: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      db: jest.fn().mockReturnValue({
        command: jest.fn().mockResolvedValue({ ok: 1 }),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

import { ShardingService } from '../../services/sharding.service';

// Reset singleton between tests
beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ShardingService as any).instance = undefined;
});

describe('ShardingService', () => {
  describe('getInstance()', () => {
    it('returns the same instance on repeated calls', () => {
      const a = ShardingService.getInstance();
      const b = ShardingService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('getShardForDocument()', () => {
    it('returns a shard for a known collection', () => {
      const svc = ShardingService.getInstance();
      const result = svc.getShardForDocument('Patient', 'clinic-001');

      expect(result).toHaveProperty('shardId');
      expect(result).toHaveProperty('connectionString');
      expect(result).toHaveProperty('shardName');
      expect(result.shardId).toMatch(/^shard-\d+$/);
    });

    it('returns shard-1 as default for unknown collections', () => {
      const svc = ShardingService.getInstance();
      const result = svc.getShardForDocument('UnknownCollection', 'some-key');
      expect(result.shardId).toBe('shard-1');
    });

    it('produces deterministic results for the same key', () => {
      const svc = ShardingService.getInstance();
      const r1 = svc.getShardForDocument('Encounter', 'clinic-abc');
      const r2 = svc.getShardForDocument('Encounter', 'clinic-abc');
      expect(r1.shardId).toBe(r2.shardId);
    });

    it('distributes different keys across shards', () => {
      const svc = ShardingService.getInstance();
      const shardIds = new Set<string>();
      // Use a sufficiently large set of keys to cover all 4 shards statistically
      for (let i = 0; i < 200; i++) {
        const route = svc.getShardForDocument('Patient', `clinic-${i}`);
        shardIds.add(route.shardId);
      }
      // Expect at least 2 distinct shards (statistical guarantee with 200 keys)
      expect(shardIds.size).toBeGreaterThanOrEqual(2);
    });

    it('uses month index for CommunicationLog range sharding', () => {
      const svc = ShardingService.getInstance();
      const date = new Date('2025-03-15'); // March → month 2
      const result = svc.getShardForDocument('CommunicationLog', date);
      expect(result.shardId).toMatch(/^shard-\d+$/);
    });

    it('falls back when target shard is unavailable', () => {
      const svc = ShardingService.getInstance();
      // Mark all shards except shard-4 as unavailable
      ['shard-1', 'shard-2', 'shard-3'].forEach((name) =>
        svc.updateShardStatus(name, 'unavailable'),
      );

      const result = svc.getShardForDocument('Patient', 'clinic-xyz');
      // Should fallback to shard-4 (the only active one)
      expect(result.shardId).toBe('shard-4');
    });
  });

  describe('getShardHealth()', () => {
    it('reports all shards as healthy initially', () => {
      const svc = ShardingService.getInstance();
      const health = svc.getShardHealth();

      expect(health.totalShards).toBe(4);
      expect(health.healthyCount).toBe(4);
      expect(health.unavailable).toHaveLength(0);
    });

    it('reflects status changes from updateShardStatus()', () => {
      const svc = ShardingService.getInstance();
      svc.updateShardStatus('shard-2', 'unavailable');
      svc.updateShardStatus('shard-3', 'recovering');

      const health = svc.getShardHealth();
      expect(health.healthyCount).toBe(2);
      expect(health.degraded).toHaveLength(1);
      expect(health.unavailable).toHaveLength(1);
    });
  });

  describe('getShardingStrategy()', () => {
    it('returns strategy config for all known collections', () => {
      const svc = ShardingService.getInstance();
      const strategy = svc.getShardingStrategy();
      expect(Object.keys(strategy)).toContain('Patient');
      expect(Object.keys(strategy)).toContain('Encounter');
      expect(Object.keys(strategy)).toContain('AuditLog');
    });
  });

  describe('getBalanceReport()', () => {
    it('returns an empty report for unknown collections', () => {
      const svc = ShardingService.getInstance();
      const report = svc.getBalanceReport('NonExistentCollection');
      expect(report.shards).toHaveLength(0);
      expect(report.needsRebalance).toBe(false);
    });

    it('returns a balance report with imbalance value for known collections', () => {
      const svc = ShardingService.getInstance();
      const report = svc.getBalanceReport('Patient');
      expect(report.collection).toBe('Patient');
      expect(typeof report.imbalance).toBe('number');
      expect(Array.isArray(report.shards)).toBe(true);
    });
  });

  describe('performHealthChecks()', () => {
    it('marks shards as active when ping succeeds', async () => {
      const svc = ShardingService.getInstance();
      // Pre-mark one shard as unavailable
      svc.updateShardStatus('shard-1', 'unavailable');

      const health = await svc.performHealthChecks();
      // After successful mock ping, shard-1 should be active again
      expect(health.unavailable).toHaveLength(0);
      expect(health.healthyCount).toBe(4);
    });
  });
});
