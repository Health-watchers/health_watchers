/**
 * Database Seed Script
 * Idempotent — safe to run multiple times (uses upsert).
 *
 * Creates:
 *   - 1 clinic (virtual ObjectId)
 *   - 1 SUPER_ADMIN, 1 CLINIC_ADMIN, 1 DOCTOR user
 *   - 10 sample patients
 *   - 5 sample encounters
 *   - 3 sample payment records
 *
 * Usage: npm run seed
 */

import dotenv from 'dotenv';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ── inline model imports (avoid path-alias issues outside ts compilation) ──
import { UserModel } from '../apps/api/src/modules/auth/models/user.model';
import { PatientModel } from '../apps/api/src/modules/patients/models/patient.model';
import { PatientCounterModel } from '../apps/api/src/modules/patients/models/patient-counter.model';
import { EncounterModel } from '../apps/api/src/modules/encounters/encounter.model';
import { PaymentRecordModel } from '../apps/api/src/modules/payments/models/payment-record.model';

// ── constants ──────────────────────────────────────────────────────────────
const CLINIC_ID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const SEED_PASSWORD = 'Seed@1234!';

const USERS = [
  { fullName: 'Super Admin', email: 'superadmin@seed.dev', role: 'SUPER_ADMIN' },
  { fullName: 'Clinic Admin', email: 'clinicadmin@seed.dev', role: 'CLINIC_ADMIN' },
  { fullName: 'Dr. Seed User', email: 'doctor@seed.dev', role: 'DOCTOR' },
] as const;

const PATIENTS = [
  {
    firstName: 'Alice',
    lastName: 'Johnson',
    dob: '1985-03-12',
    sex: 'F',
    phone: '555-0101',
    address: '1 Maple St',
  },
  {
    firstName: 'Bob',
    lastName: 'Williams',
    dob: '1990-07-22',
    sex: 'M',
    phone: '555-0102',
    address: '2 Oak Ave',
  },
  {
    firstName: 'Carol',
    lastName: 'Martinez',
    dob: '1978-11-05',
    sex: 'F',
    phone: '555-0103',
    address: '3 Pine Rd',
  },
  {
    firstName: 'David',
    lastName: 'Brown',
    dob: '2000-01-30',
    sex: 'M',
    phone: '555-0104',
    address: '4 Elm Blvd',
  },
  {
    firstName: 'Eva',
    lastName: 'Davis',
    dob: '1995-06-18',
    sex: 'F',
    phone: '555-0105',
    address: '5 Cedar Ln',
  },
  {
    firstName: 'Frank',
    lastName: 'Garcia',
    dob: '1982-09-09',
    sex: 'M',
    phone: '555-0106',
    address: '6 Birch Dr',
  },
  {
    firstName: 'Grace',
    lastName: 'Wilson',
    dob: '1970-04-25',
    sex: 'F',
    phone: '555-0107',
    address: '7 Walnut Ct',
  },
  {
    firstName: 'Henry',
    lastName: 'Anderson',
    dob: '1988-12-14',
    sex: 'M',
    phone: '555-0108',
    address: '8 Spruce Way',
  },
  {
    firstName: 'Iris',
    lastName: 'Thomas',
    dob: '2003-08-03',
    sex: 'F',
    phone: '555-0109',
    address: '9 Ash Pl',
  },
  {
    firstName: 'James',
    lastName: 'Jackson',
    dob: '1965-02-20',
    sex: 'M',
    phone: '555-0110',
    address: '10 Poplar St',
  },
] as const;

const COMPLAINTS = [
  'Persistent headache for 3 days',
  'Fever and chills since yesterday',
  'Lower back pain after lifting',
  'Shortness of breath on exertion',
  'Routine annual check-up',
];

const PAYMENT_RECORDS = [
  {
    intentId: 'seed-intent-001',
    amount: '150.00',
    destination: 'GBSEED1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    memo: 'Consultation fee',
    status: 'confirmed',
  },
  {
    intentId: 'seed-intent-002',
    amount: '75.50',
    destination: 'GBSEED2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    memo: 'Lab work payment',
    status: 'confirmed',
  },
  {
    intentId: 'seed-intent-003',
    amount: '200.00',
    destination: 'GBSEED3XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    memo: 'Specialist referral',
    status: 'pending',
  },
] as const;

// ── helpers ────────────────────────────────────────────────────────────────
async function getOrCreateCounter(clinicId: string): Promise<number> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: `patient_${clinicId}` },
    { $setOnInsert: { value: 1000 } },
    { upsert: true, new: true }
  );
  return counter.value;
}

async function nextSystemId(clinicId: string): Promise<string> {
  const counter = await PatientCounterModel.findOneAndUpdate(
    { _id: `patient_${clinicId}` },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return `P-${counter!.value}`;
}

// ── main ───────────────────────────────────────────────────────────────────
async function seed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌  MONGO_URI is not set. Check your .env.local or .env file.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('✅  Connected to MongoDB');

  // 1. Users
  console.log('\n👤  Seeding users...');
  const hashedPassword = await bcrypt.hash(SEED_PASSWORD, 12);
  for (const u of USERS) {
    await UserModel.findOneAndUpdate(
      { email: u.email },
      {
        $setOnInsert: {
          ...u,
          password: hashedPassword,
          clinicId: CLINIC_ID,
          isActive: true,
          mfaEnabled: false,
        },
      },
      { upsert: true, new: true }
    );
    console.log(`   ✔ ${u.role}: ${u.email}`);
  }

  // 2. Patients
  console.log('\n🏥  Seeding patients...');
  await getOrCreateCounter(CLINIC_ID.toString());
  const patientDocs: mongoose.Document[] = [];

  for (const p of PATIENTS) {
    const searchName = `${p.firstName} ${p.lastName}`.toLowerCase();
    const existing = await PatientModel.findOne({ searchName, clinicId: CLINIC_ID.toString() });
    if (existing) {
      patientDocs.push(existing);
      console.log(`   ↩ skipped (exists): ${p.firstName} ${p.lastName}`);
      continue;
    }
    const systemId = await nextSystemId(CLINIC_ID.toString());
    const doc = await PatientModel.create({
      systemId,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: new Date(p.dob),
      sex: p.sex,
      contactNumber: p.phone,
      address: p.address,
      clinicId: CLINIC_ID.toString(),
      isActive: true,
      searchName,
    });
    patientDocs.push(doc);
    console.log(`   ✔ ${systemId}: ${p.firstName} ${p.lastName}`);
  }

  // 3. Encounters (5, one per first 5 patients)
  console.log('\n📋  Seeding encounters...');
  for (let i = 0; i < 5; i++) {
    const patient = patientDocs[i] as any;
    const existing = await EncounterModel.findOne({
      patientId: patient._id,
      chiefComplaint: COMPLAINTS[i],
    });
    if (existing) {
      console.log(`   ↩ skipped (exists): encounter for ${patient.firstName}`);
      continue;
    }
    await EncounterModel.create({
      patientId: patient._id,
      clinicId: CLINIC_ID,
      chiefComplaint: COMPLAINTS[i],
      notes: `Seed encounter note for ${patient.firstName} ${patient.lastName}.`,
    });
    console.log(`   ✔ Encounter: "${COMPLAINTS[i]}" — ${patient.firstName} ${patient.lastName}`);
  }

  // 4. Payment records
  console.log('\n💳  Seeding payment records...');
  for (const pr of PAYMENT_RECORDS) {
    await PaymentRecordModel.findOneAndUpdate(
      { intentId: pr.intentId },
      { $setOnInsert: { ...pr, clinicId: CLINIC_ID.toString() } },
      { upsert: true, new: true }
    );
    console.log(`   ✔ ${pr.intentId}: ${pr.amount} XLM (${pr.status})`);
  }

  console.log('\n🎉  Seed complete!\n');
  console.log('   Login credentials (all share the same password):');
  console.log(`   Password: ${SEED_PASSWORD}`);
  for (const u of USERS) console.log(`   ${u.role.padEnd(14)} → ${u.email}`);
  console.log();

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
