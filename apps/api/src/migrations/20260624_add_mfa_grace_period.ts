import { Db } from 'mongodb';

/**
 * Migration: Add mfaGracePeriodEndsAt to users collection.
 *
 * DOCTOR and NURSE users that don't have MFA enabled get a 7-day grace period
 * before login is blocked. This field tracks when that deadline expires.
 *
 * Also adds an index on expoPushToken for efficient push-token lookups (#1672).
 */
export async function up(db: Db): Promise<void> {
  // Add the index so the grace period reminder job query is fast
  await db
    .collection('users')
    .createIndex(
      { role: 1, mfaEnabled: 1, mfaGracePeriodEndsAt: 1 },
      { background: true, sparse: true, name: 'role_1_mfaEnabled_1_mfaGracePeriodEndsAt_1' }
    );

  // Backfill mfaGracePeriodEndsAt for existing admin/doctor/nurse users without MFA.
  // These users get a 7-day grace period (now + 7 days) before login is blocked.
  const gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.collection('users').updateMany(
    {
      role: { $in: ['admin', 'doctor', 'nurse'] },
      mfaEnabled: { $ne: true },
      mfaGracePeriodEndsAt: { $exists: false },
    },
    { $set: { mfaGracePeriodEndsAt: gracePeriodEndsAt } }
  );

  // Add an index on expoPushToken so push-token lookups are efficient (#1672)
  await db
    .collection('users')
    .createIndex(
      { expoPushToken: 1 },
      { background: true, sparse: true, name: 'expoPushToken_1' }
    );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('users')
    .dropIndex('role_1_mfaEnabled_1_mfaGracePeriodEndsAt_1')
    .catch(() => {});

  await db
    .collection('users')
    .dropIndex('expoPushToken_1')
    .catch(() => {});

  // Remove the backfilled grace period field from users that had it set by this migration.
  // (Best-effort: only clears the field; does not attempt to distinguish pre-existing values.)
  await db
    .collection('users')
    .updateMany(
      { role: { $in: ['admin', 'doctor', 'nurse'] }, mfaEnabled: { $ne: true } },
      { $unset: { mfaGracePeriodEndsAt: '' } }
    )
    .catch(() => {});
}