import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add fee sponsorship fields to payment_records collection
  await db.collection('payment_records').updateMany(
    {},
    {
      $set: {
        sponsorFees: false,
      },
    }
  );

  // Create index for feeBumpHash
  await db
    .collection('payment_records')
    .createIndex({ feeBumpHash: 1 }, { background: true, name: 'feeBumpHash_1', sparse: true });
}

export async function down(db: Db): Promise<void> {
  // Remove fee sponsorship fields
  await db.collection('payment_records').updateMany(
    {},
    {
      $unset: {
        sponsorFees: '',
        sponsoredFeeAmount: '',
        feeBumpHash: '',
      },
    }
  );

  // Drop index
  await db
    .collection('payment_records')
    .dropIndex('feeBumpHash_1')
    .catch(() => {});
}
