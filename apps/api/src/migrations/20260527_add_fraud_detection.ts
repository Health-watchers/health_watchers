import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create fraud alert collection with indexes
  await db.createCollection('fraudalerts').catch(() => {});
  await db
    .collection('fraudalerts')
    .createIndex(
      { paymentIntentId: 1 },
      { background: true, name: 'paymentIntentId_1', unique: true }
    );
  await db
    .collection('fraudalerts')
    .createIndex({ clinicId: 1, status: 1 }, { background: true, name: 'clinicId_1_status_1' });
  await db
    .collection('fraudalerts')
    .createIndex({ createdAt: 1 }, { background: true, name: 'createdAt_1' });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('fraudalerts')
    .dropIndex('paymentIntentId_1')
    .catch(() => {});
  await db
    .collection('fraudalerts')
    .dropIndex('clinicId_1_status_1')
    .catch(() => {});
  await db
    .collection('fraudalerts')
    .dropIndex('createdAt_1')
    .catch(() => {});
  await db.dropCollection('fraudalerts').catch(() => {});
}
