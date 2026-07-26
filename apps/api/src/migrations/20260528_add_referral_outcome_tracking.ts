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
}
