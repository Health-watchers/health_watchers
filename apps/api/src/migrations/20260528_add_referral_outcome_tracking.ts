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

export async function addExternalProviderTracking(db: Db): Promise<void> {
  // Add external provider fields and status timeline to Referral collection
  await db.collection('referrals').updateMany(
    {},
    {
      $set: {
        providerType: 'internal',
        externalProvider: null,
        statusHistory: [],
      },
    }
  );

  // Index for filtering referrals by provider type
  await db
    .collection('referrals')
    .createIndex(
      { providerType: 1 },
      { background: true, name: 'providerType_1' }
    );

  // Index for status timeline queries (most recent status updates)
  await db
    .collection('referrals')
    .createIndex(
      { 'statusHistory.updatedAt': -1 },
      { background: true, name: 'statusHistory.updatedAt_-1' }
    );

  // Index to support the 30-day follow-up job and timeline lookups per clinic
  await db
    .collection('referrals')
    .createIndex(
      { toClinicId: 1, status: 1 },
      { background: true, name: 'toClinicId_1_status_1' }
    );
}

export async function down(db: Db): Promise<void> {
  // Remove external provider tracking fields
  await db.collection('referrals').updateMany(
    {},
    {
      $unset: {
        providerType: '',
        externalProvider: '',
        statusHistory: '',
      },
    }
  );

  // Drop external provider indexes
  await db
    .collection('referrals')
    .dropIndex('providerType_1')
    .catch(() => {});
  await db
    .collection('referrals')
    .dropIndex('statusHistory.updatedAt_-1')
    .catch(() => {});
  await db
    .collection('referrals')
    .dropIndex('toClinicId_1_status_1')
    .catch(() => {});

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