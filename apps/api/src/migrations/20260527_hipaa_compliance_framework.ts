import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create BAA collection with indexes
  await db.createCollection('baas').catch(() => {});
  await db
    .collection('baas')
    .createIndex(
      { clinicId: 1, businessAssociate: 1 },
      { background: true, name: 'clinicId_1_businessAssociate_1', unique: true }
    );
  await db.collection('baas').createIndex({ status: 1 }, { background: true, name: 'status_1' });
  await db
    .collection('baas')
    .createIndex({ expiryDate: 1 }, { background: true, name: 'expiryDate_1' });

  // Create breach notifications collection with indexes
  await db.createCollection('breachnotifications').catch(() => {});
  await db
    .collection('breachnotifications')
    .createIndex(
      { clinicId: 1, detectedAt: -1 },
      { background: true, name: 'clinicId_1_detectedAt_-1' }
    );
  await db
    .collection('breachnotifications')
    .createIndex({ status: 1 }, { background: true, name: 'status_1' });
  await db
    .collection('breachnotifications')
    .createIndex({ notificationDeadline: 1 }, { background: true, name: 'notificationDeadline_1' });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('baas')
    .dropIndex('clinicId_1_businessAssociate_1')
    .catch(() => {});
  await db
    .collection('baas')
    .dropIndex('status_1')
    .catch(() => {});
  await db
    .collection('baas')
    .dropIndex('expiryDate_1')
    .catch(() => {});
  await db.dropCollection('baas').catch(() => {});

  await db
    .collection('breachnotifications')
    .dropIndex('clinicId_1_detectedAt_-1')
    .catch(() => {});
  await db
    .collection('breachnotifications')
    .dropIndex('status_1')
    .catch(() => {});
  await db
    .collection('breachnotifications')
    .dropIndex('notificationDeadline_1')
    .catch(() => {});
  await db.dropCollection('breachnotifications').catch(() => {});
}
