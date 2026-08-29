export interface ArchivePolicy {
  collection: string;
  archiveAfterDays: number;
  retentionDays: number;
  batchSize: number;
  enabled: boolean;
}

export const DEFAULT_ARCHIVE_POLICIES: ArchivePolicy[] = [
  {
    collection: 'encounters',
    archiveAfterDays: 365, // Archive encounters older than 1 year
    retentionDays: 2555, // Keep archives for 7 years (compliance requirement)
    batchSize: 1000,
    enabled: true,
  },
  {
    collection: 'communications',
    archiveAfterDays: 730, // Archive communications older than 2 years
    retentionDays: 1825, // Keep archives for 5 years
    batchSize: 1000,
    enabled: true,
  },
  {
    collection: 'audit',
    archiveAfterDays: 365, // Archive audit logs older than 1 year
    retentionDays: 2555, // Keep archives for 7 years (compliance)
    batchSize: 5000,
    enabled: true,
  },
  {
    collection: 'health-log',
    archiveAfterDays: 1095, // Archive health logs older than 3 years
    retentionDays: 2555, // Keep archives for 7 years
    batchSize: 2000,
    enabled: true,
  },
];

export function getPolicyForCollection(collectionName: string): ArchivePolicy | undefined {
  return DEFAULT_ARCHIVE_POLICIES.find((p) => p.collection === collectionName && p.enabled);
}
