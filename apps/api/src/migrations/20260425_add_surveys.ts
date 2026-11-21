import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  await db.collection('surveys').createIndex({ token: 1 }, { unique: true });
  await db.collection('surveys').createIndex({ encounterId: 1 });
  await db.collection('surveys').createIndex({ patientId: 1 });
  await db.collection('surveys').createIndex({ clinicId: 1 });
  await db.collection('surveys').createIndex({ doctorId: 1 });
  await db.collection('surveys').createIndex({ status: 1, expiresAt: 1 });
  await db.collection('surveys').createIndex({ clinicId: 1, doctorId: 1, completedAt: 1 });

  // Portal flow fields: assignedAt, notificationSentAt, questions, responses.
  // Backfill assignedAt for existing surveys so the portal listing and
  // analytics queries have a stable sort/aggregation key.
  await db.collection('surveys').updateMany(
    { assignedAt: { $exists: false } },
    [{ $set: { assignedAt: { $ifNull: ['$createdAt', '$$NOW'] } } }],
  );

  // Ensure questions/responses arrays exist for documents created before the
  // portal flow was introduced. Question types supported:
  // 'multiple_choice' | 'likert' | 'free_text' | 'date'.
  await db.collection('surveys').updateMany(
    { questions: { $exists: false } },
    { $set: { questions: [] } },
  );
  await db.collection('surveys').updateMany(
    { responses: { $exists: false } },
    { $set: { responses: [] } },
  );

  // Portal listing: pending surveys for a patient ordered by assignment time.
  await db
    .collection('surveys')
    .createIndex({ patientId: 1, status: 1, assignedAt: 1 });

  // Analytics: response rate and average scores per question for a clinic.
  await db.collection('surveys').createIndex({ clinicId: 1, completedAt: 1 });
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
  await db
    .collection('surveys')
    .dropIndex('patientId_1_status_1_assignedAt_1')
    .catch(() => {});
  await db
    .collection('surveys')
    .dropIndex('clinicId_1_completedAt_1')
    .catch(() => {});
}