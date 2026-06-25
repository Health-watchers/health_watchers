import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add patientNotes array field to encounters that don't have it yet
  await db.collection('encounters').updateMany(
    { patientNotes: { $exists: false } },
    { $set: { patientNotes: [] } }
  );
  // Index for efficient patient note queries
  await db.collection('encounters').createIndex(
    { patientId: 1, 'patientNotes.createdAt': -1 },
    { name: 'patientId_1_patientNotes_createdAt_-1', sparse: true }
  );
}

export async function down(db: Db): Promise<void> {
  await db.collection('encounters').dropIndex('patientId_1_patientNotes_createdAt_-1').catch(() => {});
  await db.collection('encounters').updateMany({}, { $unset: { patientNotes: '' } });
}
