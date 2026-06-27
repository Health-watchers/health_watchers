import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.createCollection('triagequeues');
  await db.collection('triagequeues').createIndex({ clinicId: 1, status: 1, arrivalTime: -1 });
  await db.collection('triagequeues').createIndex({ clinicId: 1, urgencyLevel: 1, arrivalTime: 1 });
  await db.collection('triagequeues').createIndex({ patientId: 1 });
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('triagequeues')
    .drop()
    .catch(() => {});
}
