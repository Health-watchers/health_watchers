import { Db } from 'mongodb';

/**
 * #1069 — Add the clinicId_1_isActive_1 compound index used as a query hint
 * in the patient list endpoint (GET /patients?page=&limit=).
 *
 * This index allows MongoDB to satisfy the { clinicId, isActive: true } filter
 * without a collection scan, reducing query time from O(N) to O(log N) at scale.
 *
 * The migration is idempotent — createIndex is a no-op when the named index
 * already exists with the same key pattern and options.
 */
export async function up(db: Db): Promise<void> {
  await db.collection('patients').createIndex(
    { clinicId: 1, isActive: 1 },
    {
      background: true,
      name: 'clinicId_1_isActive_1',
    }
  );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('patients')
    .dropIndex('clinicId_1_isActive_1')
    .catch(() => {});
}
