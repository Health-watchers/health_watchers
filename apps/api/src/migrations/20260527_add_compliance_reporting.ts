import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Create compliance reports collection with indexes
  await db.createCollection('compliancereports').catch(() => {});
  await db
    .collection('compliancereports')
    .createIndex({ clinicId: 1 }, { background: true, name: 'clinicId_1' });
  await db
    .collection('compliancereports')
    .createIndex(
      { clinicId: 1, reportingPeriod: 1, jurisdiction: 1 },
      { background: true, name: 'clinicId_1_reportingPeriod_1_jurisdiction_1', unique: true }
    );
  await db
    .collection('compliancereports')
    .createIndex({ status: 1, createdAt: 1 }, { background: true, name: 'status_1_createdAt_1' });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('compliancereports')
    .dropIndex('clinicId_1')
    .catch(() => {});
  await db
    .collection('compliancereports')
    .dropIndex('clinicId_1_reportingPeriod_1_jurisdiction_1')
    .catch(() => {});
  await db
    .collection('compliancereports')
    .dropIndex('status_1_createdAt_1')
    .catch(() => {});
  await db.dropCollection('compliancereports').catch(() => {});
}
