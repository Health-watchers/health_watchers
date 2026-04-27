import { Db } from 'mongodb';

const SIX_YEARS_IN_SECONDS = 6 * 365 * 24 * 60 * 60; // 189,216,000 seconds

/**
 * Add a 6-year TTL index on audit_logs.timestamp per HIPAA 45 CFR § 164.312(b) (#339).
 */
export async function up(db: Db): Promise<void> {
  await db.collection('audit_logs').createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: SIX_YEARS_IN_SECONDS, name: 'audit_logs_ttl_6yr' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('audit_logs').dropIndex('audit_logs_ttl_6yr').catch(() => {});
}
