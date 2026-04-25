import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.collection('surveys').createIndex({ token: 1 }, { unique: true });
  await db.collection('surveys').createIndex({ encounterId: 1 });
  await db.collection('surveys').createIndex({ patientId: 1 });
  await db.collection('surveys').createIndex({ clinicId: 1 });
  await db.collection('surveys').createIndex({ doctorId: 1 });
  await db.collection('surveys').createIndex({ status: 1, expiresAt: 1 });
  await db.collection('surveys').createIndex({ clinicId: 1, doctorId: 1, completedAt: 1 });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('surveys')
    .dropIndex('token_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('encounterId_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('patientId_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('clinicId_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('doctorId_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('status_1_expiresAt_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('clinicId_1_doctorId_1_completedAt_1')
    .catch(() => {});
}
