/**
 * Tests for the data archival strategy — issue #1074
 */
import { DEFAULT_ARCHIVE_POLICIES, getPolicyForCollection } from '../archive-policies';

describe('Archive Policies (#1074)', () => {
  describe('DEFAULT_ARCHIVE_POLICIES', () => {
    it('should define policies for all key collections', () => {
      const collections = DEFAULT_ARCHIVE_POLICIES.map((p) => p.collection);
      expect(collections).toContain('encounters');
      expect(collections).toContain('communications');
      expect(collections).toContain('audit');
      expect(collections).toContain('health-log');
    });

    it('should have valid archive thresholds', () => {
      for (const policy of DEFAULT_ARCHIVE_POLICIES) {
        expect(policy.archiveAfterDays).toBeGreaterThan(0);
        expect(policy.retentionDays).toBeGreaterThan(policy.archiveAfterDays);
        expect(policy.batchSize).toBeGreaterThan(0);
      }
    });

    it('encounters policy should archive after 365 days and retain for 7 years (HIPAA)', () => {
      const policy = getPolicyForCollection('encounters');
      expect(policy).toBeDefined();
      expect(policy!.archiveAfterDays).toBe(365);
      expect(policy!.retentionDays).toBe(2555); // ~7 years
    });

    it('audit policy should retain for 7 years (compliance)', () => {
      const policy = getPolicyForCollection('audit');
      expect(policy).toBeDefined();
      expect(policy!.retentionDays).toBe(2555);
    });

    it('all policies should be enabled', () => {
      for (const policy of DEFAULT_ARCHIVE_POLICIES) {
        expect(policy.enabled).toBe(true);
      }
    });
  });

  describe('getPolicyForCollection', () => {
    it('should return policy for known collections', () => {
      const encounterPolicy = getPolicyForCollection('encounters');
      expect(encounterPolicy).toBeDefined();
      expect(encounterPolicy!.collection).toBe('encounters');
    });

    it('should return undefined for unknown collections', () => {
      const policy = getPolicyForCollection('nonexistent');
      expect(policy).toBeUndefined();
    });

    it('should only return enabled policies', () => {
      const policy = getPolicyForCollection('encounters');
      expect(policy?.enabled).toBe(true);
    });
  });
});

describe('Archive Model structure (#1074)', () => {
  it('should export ArchiveModel', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ArchiveModel } = require('../archive.model');
    expect(ArchiveModel).toBeDefined();
  });

  it('should export archive barrel items individually', () => {
    // Test each piece separately to avoid triggering getConnection() via ArchiveService
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ArchiveModel } = require('../archive.model');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      DEFAULT_ARCHIVE_POLICIES: policies,
      getPolicyForCollection: getPolicy,
    } = require('../archive-policies');

    expect(ArchiveModel).toBeDefined();
    expect(policies).toBeDefined();
    expect(getPolicy).toBeDefined();
  });

  it('archive policies should have all required fields', () => {
    for (const policy of DEFAULT_ARCHIVE_POLICIES) {
      expect(policy).toHaveProperty('collection');
      expect(policy).toHaveProperty('archiveAfterDays');
      expect(policy).toHaveProperty('retentionDays');
      expect(policy).toHaveProperty('batchSize');
      expect(policy).toHaveProperty('enabled');
    }
  });
});
