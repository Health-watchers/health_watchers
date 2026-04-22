/**
 * Migration: backfill Clinic model fields and standardize clinicId to ObjectId
 *
 * Run once against your database:
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-clinic-model.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI!);
  const db = mongoose.connection.db!;

  // 1. Backfill missing required fields on existing clinics
  const clinicResult = await db.collection('clinics').updateMany(
    { address: { $exists: false } },
    {
      $set: {
        address: 'Unknown',
        phone: 'Unknown',
        email: 'unknown@placeholder.invalid',
        subscriptionTier: 'free',
      },
    },
  );
  console.log(`Clinics backfilled: ${clinicResult.modifiedCount}`);

  // 2. Standardize clinicId from String to ObjectId in patients collection
  const patients = await db.collection('patients').find({ clinicId: { $type: 'string' } }).toArray();
  let patientFixed = 0;
  for (const p of patients) {
    try {
      await db
        .collection('patients')
        .updateOne({ _id: p._id }, { $set: { clinicId: new mongoose.Types.ObjectId(p.clinicId) } });
      patientFixed++;
    } catch {
      console.warn(`Skipping patient ${p._id}: invalid clinicId '${p.clinicId}'`);
    }
  }
  console.log(`Patients clinicId standardized: ${patientFixed}`);

  await mongoose.disconnect();
  console.log('Migration complete.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
