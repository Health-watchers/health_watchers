/**
 * Migration: add export_schedules collection with supporting indexes (Issue #1243).
 *
 * up   – creates the collection + indexes (idempotent)
 * down – drops the indexes + collection
 */
import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create the collection (no-op if it already exists)
  const collections = await db.listCollections({ name: 'exportschedules' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('exportschedules');
  }

  const col = db.collection('exportschedules');

  // Index: look up schedules by clinic
  await col.createIndex({ clinicId: 1, isEnabled: 1 }, { background: true, name: 'clinicId_1_isEnabled_1' });

  // Index: look up schedules by patient (for patient-scoped automation)
  await col.createIndex({ patientId: 1 }, { background: true, sparse: true, name: 'patientId_1_sparse' });

  // Index: sort by creation time (for the listing API)
  await col.createIndex({ createdAt: -1 }, { background: true, name: 'createdAt_-1' });

  // Index: TTL for lastRunAt (for monitoring / alerting — not auto-delete, just useful)
  await col.createIndex({ lastRunAt: 1 }, { background: true, sparse: true, name: 'lastRunAt_1_sparse' });
}

export async function down(db: Db): Promise<void> {
  const col = db.collection('exportschedules');

  await col.dropIndex('clinicId_1_isEnabled_1').catch(() => {});
  await col.dropIndex('patientId_1_sparse').catch(() => {});
  await col.dropIndex('createdAt_-1').catch(() => {});
  await col.dropIndex('lastRunAt_1_sparse').catch(() => {});

  await db.dropCollection('exportschedules').catch(() => {});
}
