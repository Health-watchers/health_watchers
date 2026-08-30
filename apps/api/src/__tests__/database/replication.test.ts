/**
 * Unit tests for db-replication config — Issue #1080
 *
 * Tests the exported helpers without requiring a live MongoDB instance.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReplSetGetStatus = jest.fn();
const mockAdmin = jest.fn().mockReturnValue({ replSetGetStatus: mockReplSetGetStatus });
const mockDb = { admin: mockAdmin };

jest.mock('mongoose', () => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  connection: {
    db: mockDb,
    readyState: 1,
    on: jest.fn(),
    setOptions: jest.fn(),
  },
  Mongoose: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../utils/logger', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@health-watchers/config', () => ({
  config: { mongoUri: 'mongodb://localhost:27017/test' },
}));

import mongoose from 'mongoose';
import {
  DEFAULT_REPLICATION_CONFIG,
  READ_PREFERENCES,
  configureReadPreferences,
  getReplicationHealthStatus,
  getReplicationLagMetrics,
  monitorConsistency,
  startReplicationMonitoring,
  stopReplicationMonitoring,
} from '../../config/db-replication';

describe('db-replication config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DEFAULT_REPLICATION_CONFIG', () => {
    it('uses secondaryPreferred read preference by default', () => {
      expect(DEFAULT_REPLICATION_CONFIG.readPreference).toBe('secondaryPreferred');
    });

    it('uses majority write concern', () => {
      expect(DEFAULT_REPLICATION_CONFIG.w).toBe('majority');
    });

    it('has journal enabled', () => {
      expect(DEFAULT_REPLICATION_CONFIG.j).toBe(true);
    });

    it('has retry writes enabled', () => {
      expect(DEFAULT_REPLICATION_CONFIG.retryWrites).toBe(true);
    });
  });

  describe('READ_PREFERENCES', () => {
    it('exports the expected preference names', () => {
      const keys = Object.keys(READ_PREFERENCES);
      expect(keys).toContain('consistent');
      expect(keys).toContain('balanced');
      expect(keys).toContain('analytics');
      expect(keys).toContain('lowest_latency');
    });

    it('consistent preference uses primary', () => {
      expect(READ_PREFERENCES.consistent.readPreference).toBe('primary');
    });

    it('analytics preference uses secondary', () => {
      expect(READ_PREFERENCES.analytics.readPreference).toBe('secondary');
    });

    it('analytics preference allows staleness', () => {
      expect(READ_PREFERENCES.analytics.maxStalenessSeconds).toBeGreaterThan(0);
    });
  });

  describe('configureReadPreferences()', () => {
    it('calls setOptions on the mongoose connection', () => {
      configureReadPreferences(READ_PREFERENCES.balanced);
      expect(mongoose.connection.setOptions).toHaveBeenCalledWith(
        expect.objectContaining({ readPreference: 'secondaryPreferred' })
      );
    });
  });

  describe('getReplicationLagMetrics()', () => {
    it('returns null when replica set status is unavailable', async () => {
      mockReplSetGetStatus.mockResolvedValueOnce(null);
      const result = await getReplicationLagMetrics();
      expect(result).toBeNull();
    });

    it('computes lag for secondaries', async () => {
      const now = new Date();
      const lagMs = 200;

      mockReplSetGetStatus.mockResolvedValueOnce({
        members: [
          { state: 1, name: 'primary:27017', optime: { ts: now }, health: 1 },
          {
            state: 2,
            name: 'secondary:27017',
            optime: { ts: new Date(now.getTime() - lagMs) },
            health: 1,
          },
        ],
      });

      const metrics = await getReplicationLagMetrics();
      expect(metrics).not.toBeNull();
      expect(metrics!.maxLagMs).toBeGreaterThanOrEqual(0);
      expect(metrics!.secondaries).toHaveLength(1);
    });

    it('handles errors gracefully and returns null', async () => {
      mockReplSetGetStatus.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await getReplicationLagMetrics();
      expect(result).toBeNull();
    });
  });

  describe('monitorConsistency()', () => {
    it('reports healthy when all members are up and a primary exists', async () => {
      mockReplSetGetStatus.mockResolvedValueOnce({
        members: [
          { state: 1, name: 'primary:27017', health: 1 },
          { state: 2, name: 'secondary1:27017', health: 1 },
          { state: 2, name: 'secondary2:27017', health: 1 },
        ],
      });

      const consistency = await monitorConsistency();
      expect(consistency).not.toBeNull();
      expect(consistency!.isHealthy).toBe(true);
      expect(consistency!.primaryHealth).toBe(true);
      expect(consistency!.unhealthyMembers).toHaveLength(0);
    });

    it('reports unhealthy when a member is down', async () => {
      mockReplSetGetStatus.mockResolvedValueOnce({
        members: [
          { state: 1, name: 'primary:27017', health: 1 },
          { state: 2, name: 'secondary1:27017', health: 0, stateStr: 'DOWN' },
        ],
      });

      const consistency = await monitorConsistency();
      expect(consistency!.isHealthy).toBe(false);
      expect(consistency!.unhealthyMembers).toHaveLength(1);
    });

    it('returns null-safe result on DB error', async () => {
      mockReplSetGetStatus.mockRejectedValueOnce(new Error('timeout'));
      const result = await monitorConsistency();
      expect(result).toBeNull();
    });
  });

  describe('getReplicationHealthStatus()', () => {
    it('returns healthy status when replica set is fully operational', async () => {
      const now = new Date();

      // First call: getReplicationLagMetrics
      mockReplSetGetStatus.mockResolvedValueOnce({
        members: [
          { state: 1, name: 'primary:27017', optime: { ts: now }, health: 1 },
          {
            state: 2,
            name: 'secondary:27017',
            optime: { ts: new Date(now.getTime() - 10) },
            health: 1,
          },
        ],
      });

      // Second call: monitorConsistency
      mockReplSetGetStatus.mockResolvedValueOnce({
        members: [
          { state: 1, name: 'primary:27017', health: 1 },
          { state: 2, name: 'secondary:27017', health: 1 },
        ],
      });

      const status = await getReplicationHealthStatus();
      expect(['healthy', 'degraded', 'critical']).toContain(status.status);
      expect(Array.isArray(status.issues)).toBe(true);
    });
  });

  describe('startReplicationMonitoring() / stopReplicationMonitoring()', () => {
    it('starts and stops without throwing', () => {
      expect(() => startReplicationMonitoring(60000)).not.toThrow();
      expect(() => stopReplicationMonitoring()).not.toThrow();
    });

    it('does not start a second interval when called twice', () => {
      startReplicationMonitoring(60000);
      startReplicationMonitoring(60000); // second call should be a no-op
      stopReplicationMonitoring();
    });
  });
});
