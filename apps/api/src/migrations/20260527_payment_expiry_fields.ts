import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add expiresAt and paymentType fields to PaymentRecord collection
  await db.collection('paymentrecords').updateMany(
    {},
    {
      $set: {
        paymentType: 'immediate',
      },
    }
  );

  // Create index for expiry queries
  await db.collection('paymentrecords').createIndex(
    { expiresAt: 1 },
    { background: true, name: 'expiresAt_1' }
  );

  // Create compound index for pending payment expiry checks
  await db.collection('paymentrecords').createIndex(
    { status: 1, expiresAt: 1 },
    { background: true, name: 'status_1_expiresAt_1' }
  );
}

export async function down(db: Db): Promise<void> {
  // Drop indexes
  await db.collection('paymentrecords').dropIndex('expiresAt_1').catch(() => {});
  await db.collection('paymentrecords').dropIndex('status_1_expiresAt_1').catch(() => {});

  // Remove fields
  await db.collection('paymentrecords').updateMany(
    {},
    {
      $unset: {
        expiresAt: '',
        paymentType: '',
      },
    }
  );
}
