import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add claimableExpiryNotificationSent field to existing records
  await db.collection('paymentrecords').updateMany(
    { claimableBalanceId: { $exists: true }, claimableExpiryNotificationSent: { $exists: false } },
    { $set: { claimableExpiryNotificationSent: false } }
  );

  // Index for efficient job queries
  await db.collection('paymentrecords').createIndex(
    { claimableUntil: 1, claimed: 1, claimableExpiryNotificationSent: 1 },
    { background: true, name: 'claimableUntil_1_claimed_1_notificationSent_1' }
  );
}

export async function down(db: Db): Promise<void> {
  await db
    .collection('paymentrecords')
    .dropIndex('claimableUntil_1_claimed_1_notificationSent_1')
    .catch(() => {});

  await db.collection('paymentrecords').updateMany(
    {},
    { $unset: { claimableExpiryNotificationSent: '' } }
  );
}
