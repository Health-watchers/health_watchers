import { Db } from 'mongodb';

/**
 * Adds compound indexes optimised for the dashboard aggregation queries:
 *   patients:      { clinicId, createdAt }  — count/list new patients today
 *   encounters:    { clinicId, createdAt }  — already exists; added idempotently
 *   paymentrecords: { clinicId, status, createdAt } — count/list pending payments
 */
export async function up(db: Db): Promise<void> {
  await db.collection('patients').createIndex(
    { clinicId: 1, createdAt: -1 },
    { background: true, name: 'clinicId_1_createdAt_-1' }
  );

  // encounters already has this index from 20260425; createIndex is idempotent by name
  await db.collection('encounters').createIndex(
    { clinicId: 1, createdAt: -1 },
    { background: true, name: 'clinicId_1_createdAt_-1' }
  );

  // Covers: countDocuments({ clinicId, status:'pending' }) + find+sort
  await db.collection('paymentrecords').createIndex(
    { clinicId: 1, status: 1, createdAt: -1 },
    { background: true, name: 'clinicId_1_status_1_createdAt_-1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('patients').dropIndex('clinicId_1_createdAt_-1').catch(() => {});
  await db.collection('paymentrecords').dropIndex('clinicId_1_status_1_createdAt_-1').catch(() => {});
}
