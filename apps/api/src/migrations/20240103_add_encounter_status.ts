import { Db } from 'mongodb';

/**
 * Ensure all Encounter documents have a status field.
 * Backfills any documents missing status with 'open' (the schema default).
 * Safe to run multiple times (idempotent).
 */
export async function up(db: Db): Promise<void> {
  await db.collection('encounters').updateMany(
    { status: { $exists: false } },
    { $set: { status: 'open' } }
  );
}

export async function down(db: Db): Promise<void> {
  // Reverting a backfill is destructive; only unset on docs that still carry
  // the default 'open' value and have no other activity indicator.
  await db.collection('encounters').updateMany(
    { status: 'open' },
    { $unset: { status: '' } }
  );
}
