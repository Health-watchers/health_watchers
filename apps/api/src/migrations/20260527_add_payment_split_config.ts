import { Db } from 'mongodb';

export async function up(db: Db): Promise<void> {
  // Add payment split config to clinics
  await db.collection('clinics').updateMany(
    {},
    {
      $set: {
        'paymentSplitConfig.splitEnabled': false,
        'paymentSplitConfig.defaultSplitRatio.clinic': 70,
        'paymentSplitConfig.defaultSplitRatio.doctor': 30,
        'paymentSplitConfig.doctorOverrides': [],
      },
    }
  );

  // Add stellarPublicKey to users
  await db.collection('users').updateMany(
    {},
    {
      $set: {
        stellarPublicKey: null,
      },
    }
  );

  // Create index for doctor stellar wallet lookups
  await db
    .collection('users')
    .createIndex({ stellarPublicKey: 1 }, { sparse: true, name: 'stellarPublicKey_1' });
}

export async function down(db: Db): Promise<void> {
  // Remove payment split config from clinics
  await db.collection('clinics').updateMany(
    {},
    {
      $unset: {
        paymentSplitConfig: '',
      },
    }
  );

  // Remove stellarPublicKey from users
  await db.collection('users').updateMany(
    {},
    {
      $unset: {
        stellarPublicKey: '',
      },
    }
  );

  // Drop index
  await db
    .collection('users')
    .dropIndex('stellarPublicKey_1')
    .catch(() => {});
}
