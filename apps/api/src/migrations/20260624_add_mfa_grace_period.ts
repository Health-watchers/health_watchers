import { Db } from 'mongodb';

/**
 * Migration: Add mfaGracePeriodEndsAt to users collection.
 *
 * DOCTOR and NURSE users that don't have MFA enabled get a 7-day grace period
 * before login is blocked. This field tracks when that deadline expires.
 */
export async function up(db: Db): Promise<void> {
  // Add the index so the grace period reminder job query is fast
  await db.collection('users').createIndex(
    { role: 1, mfaEnabled: 1, mfaGracePeriodEndsAt: 1 },
    { background: true, sparse: true, name: 'role_1_mfaEnabled_1_mfaGracePeriodEndsAt_1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('users')
    .dropIndex('role_1_mfaEnabled_1_mfaGracePeriodEndsAt_1')
    .catch(() => {});
}
