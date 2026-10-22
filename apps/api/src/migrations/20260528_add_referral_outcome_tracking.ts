import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add outcome tracking fields to Referral collection
  await db.collection('referrals').updateMany(
    {},
    {
      $set: {
        outcome: 'pending',
        outcomeDate: null,
        outcomeNotes: null,
        completedAt: null,
      },
    }
  );

  // Create indexes for outcome queries
  await db
    .collection('referrals')
    .createIndex(
      { outcome: 1, outcomeDate: -1 },
      { background: true, name: 'outcome_1_outcomeDate_-1' }
    );

  await db
    .collection('referrals')
    .createIndex(
      { toClinicId: 1, outcome: 1 },
      { background: true, name: 'toClinicId_1_outcome_1' }
    );

  // Backfill outcome tracking fields on Encounter collection
  await db.collection('encounters').updateMany(
    {},
    {
      $set: {
        outcome: 'pending',
        outcomeNotes: null,
        followUpRequired: false,
        followUpDate: null,
        followUpCompleted: false,
        followUpEncounterId: null,
      },
    }
  );

  // Create indexes for encounter outcome and follow-up queries
  await db
    .collection('encounters')
    .createIndex(
      { followUpRequired: 1, followUpDate: 1 },
      { background: true, name: 'followUpRequired_1_followUpDate_1' }
    );

  await db
    .collection('encounters')
    .createIndex(
      { outcome: 1, followUpCompleted: 1 },
      { background: true, name: 'outcome_1_followUpCompleted_1' }
    );
}

export async function down(db: Db): Promise<void> {
  // Remove outcome tracking fields
  await db.collection('referrals').updateMany(
    {},
    {
      $unset: {
        outcome: '',
        outcomeDate: '',
        outcomeNotes: '',
        completedAt: '',
      },
    }
  );

  // Drop indexes
  await db
    .collection('referrals')
    .dropIndex('outcome_1_outcomeDate_-1')
    .catch(() => {});
  await db
    .collection('referrals')
    .dropIndex('toClinicId_1_outcome_1')
    .catch(() => {});

  // Remove encounter outcome tracking fields
  await db.collection('encounters').updateMany(
    {},
    {
      $unset: {
        outcome: '',
        outcomeNotes: '',
        followUpRequired: '',
        followUpDate: '',
        followUpCompleted: '',
        followUpEncounterId: '',
      },
    }
  );

  // Drop encounter indexes
  await db
    .collection('encounters')
    .dropIndex('followUpRequired_1_followUpDate_1')
    .catch(() => {});
  await db
    .collection('encounters')
    .dropIndex('outcome_1_followUpCompleted_1')
    .catch(() => {});
}