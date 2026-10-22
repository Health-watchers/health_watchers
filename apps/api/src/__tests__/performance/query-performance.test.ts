/**
 * Query Performance Tests — Issue #1030
 *
 * Measures raw Mongoose query performance against indexes:
 *  - Covered index reads (should avoid COLLSCAN)
 *  - Aggregation pipeline performance
 *  - Sort + limit combos that rely on compound indexes
 *  - Range query performance on date fields
 */

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { EncounterModel } from '../../modules/encounters/encounter.model';
import { PaymentRecordModel } from '../../modules/payments/models/payment-record.model';
import { buildPatientBatch } from '../factories/patient.factory';
import { buildEncounterBatch } from '../factories/encounter.factory';
import { buildPaymentBatch } from '../factories/payment.factory';

// ── Thresholds (ms) ───────────────────────────────────────────────────────────
const Q = {
  simpleIndex: 50,
  compoundIndex: 80,
  aggregation: 150,
  countDocuments: 50,
  sortedList: 100,
} as const;

const CLINIC_ID = new mongoose.Types.ObjectId();
const DOCTOR_ID = new mongoose.Types.ObjectId();
const CLINIC_STR = CLINIC_ID.toString();

let mongod: MongoMemoryServer;

async function timed(fn: () => Promise<unknown>): Promise<number> {
  const start = Date.now();
  await fn();
  return Date.now() - start;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();
  await EncounterModel.ensureIndexes();
  await PaymentRecordModel.ensureIndexes();

  // Seed 1 000 patients, 2 000 encounters, 500 payments
  await PatientModel.insertMany(buildPatientBatch(1000, { clinicId: CLINIC_ID }), {
    ordered: false,
  });

  const patientIds = (
    await PatientModel.find({ clinicId: CLINIC_ID }).select('_id').limit(50).lean()
  ).map((p) => p._id as mongoose.Types.ObjectId);

  const encBatch = buildEncounterBatch(2000, {
    clinicId: CLINIC_ID,
    attendingDoctorId: DOCTOR_ID,
  }).map((e, i) => ({ ...e, patientId: patientIds[i % patientIds.length] }));
  await EncounterModel.insertMany(encBatch, { ordered: false });

  await PaymentRecordModel.insertMany(buildPaymentBatch(500, { clinicId: CLINIC_STR }), {
    ordered: false,
  });
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ── Patient queries ───────────────────────────────────────────────────────────
describe('Query performance: patients', () => {
  it(`clinicId filter completes in < ${Q.simpleIndex}ms`, async () => {
    const ms = await timed(() => PatientModel.find({ clinicId: CLINIC_ID }).limit(100).lean());
    console.log(`[qperf] patients by clinicId: ${ms}ms`);
    expect(ms).toBeLessThan(Q.simpleIndex);
  });

  it(`countDocuments by clinicId completes in < ${Q.countDocuments}ms`, async () => {
    const ms = await timed(() => PatientModel.countDocuments({ clinicId: CLINIC_ID }));
    console.log(`[qperf] countDocuments patients: ${ms}ms`);
    expect(ms).toBeLessThan(Q.countDocuments);
  });

  it(`searchName prefix regex completes in < ${Q.simpleIndex * 2}ms`, async () => {
    const ms = await timed(() =>
      PatientModel.find({
        clinicId: CLINIC_ID,
        searchName: { $regex: '^test', $options: 'i' },
      })
        .limit(50)
        .lean()
    );
    console.log(`[qperf] patients searchName prefix: ${ms}ms`);
    expect(ms).toBeLessThan(Q.simpleIndex * 2);
  });

  it(`sorted patient list (createdAt desc) completes in < ${Q.sortedList}ms`, async () => {
    const ms = await timed(() =>
      PatientModel.find({ clinicId: CLINIC_ID }).sort({ createdAt: -1 }).limit(50).lean()
    );
    console.log(`[qperf] patients sorted createdAt: ${ms}ms`);
    expect(ms).toBeLessThan(Q.sortedList);
  });

  it('clinicId filter does not cause COLLSCAN', async () => {
    await PatientModel.insertMany(buildPatientBatch(10, { clinicId: CLINIC_ID }), {
      ordered: false,
    });
    const plan = (await PatientModel.find({ clinicId: CLINIC_ID }).explain(
      'executionStats'
    )) as any;
    const stage: string =
      plan?.executionStats?.executionStages?.stage ?? plan?.queryPlanner?.winningPlan?.stage ?? '';
    expect(stage).not.toBe('COLLSCAN');
  });
});

// ── Encounter queries ─────────────────────────────────────────────────────────
describe('Query performance: encounters', () => {
  it(`find by clinicId + status completes in < ${Q.compoundIndex}ms`, async () => {
    const ms = await timed(() =>
      EncounterModel.find({ clinicId: CLINIC_ID, status: 'open' }).limit(100).lean()
    );
    console.log(`[qperf] encounters clinicId+status: ${ms}ms`);
    expect(ms).toBeLessThan(Q.compoundIndex);
  });

  it(`countDocuments open encounters completes in < ${Q.countDocuments}ms`, async () => {
    const ms = await timed(() =>
      EncounterModel.countDocuments({ clinicId: CLINIC_ID, status: 'open' })
    );
    console.log(`[qperf] count open encounters: ${ms}ms`);
    expect(ms).toBeLessThan(Q.countDocuments);
  });

  it(`encounters sorted by createdAt completes in < ${Q.sortedList}ms`, async () => {
    const ms = await timed(() =>
      EncounterModel.find({ clinicId: CLINIC_ID }).sort({ createdAt: -1 }).limit(50).lean()
    );
    console.log(`[qperf] encounters sorted createdAt: ${ms}ms`);
    expect(ms).toBeLessThan(Q.sortedList);
  });

  it(`aggregation: encounter count per status completes in < ${Q.aggregation}ms`, async () => {
    const ms = await timed(() =>
      EncounterModel.aggregate([
        { $match: { clinicId: CLINIC_ID } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
    );
    console.log(`[qperf] encounters aggregate by status: ${ms}ms`);
    expect(ms).toBeLessThan(Q.aggregation);
  });

  it(`aggregation: encounters per doctor completes in < ${Q.aggregation}ms`, async () => {
    const ms = await timed(() =>
      EncounterModel.aggregate([
        { $match: { clinicId: CLINIC_ID } },
        { $group: { _id: '$attendingDoctorId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ])
    );
    console.log(`[qperf] encounters aggregate by doctor: ${ms}ms`);
    expect(ms).toBeLessThan(Q.aggregation);
  });
});

// ── Payment queries ───────────────────────────────────────────────────────────
describe('Query performance: payments', () => {
  it(`find pending payments by clinicId in < ${Q.simpleIndex}ms`, async () => {
    const ms = await timed(() =>
      PaymentRecordModel.find({ clinicId: CLINIC_STR, status: 'pending' }).limit(50).lean()
    );
    console.log(`[qperf] payments clinicId+pending: ${ms}ms`);
    expect(ms).toBeLessThan(Q.simpleIndex);
  });

  it(`sum pending payment amounts with aggregation in < ${Q.aggregation}ms`, async () => {
    const ms = await timed(() =>
      PaymentRecordModel.aggregate([
        { $match: { clinicId: CLINIC_STR, status: 'pending' } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
      ])
    );
    console.log(`[qperf] payments total aggregation: ${ms}ms`);
    expect(ms).toBeLessThan(Q.aggregation);
  });

  it(`payment status breakdown aggregation in < ${Q.aggregation}ms`, async () => {
    const ms = await timed(() =>
      PaymentRecordModel.aggregate([
        { $match: { clinicId: CLINIC_STR } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
    );
    console.log(`[qperf] payments status breakdown: ${ms}ms`);
    expect(ms).toBeLessThan(Q.aggregation);
  });
});

// ── Cross-collection join simulation ─────────────────────────────────────────
describe('Query performance: cross-collection patterns', () => {
  it('lookup-style patient+encounter join completes in reasonable time', async () => {
    // Simulate the pattern used in the dashboard: patients with open encounter count
    const ms = await timed(() =>
      PatientModel.aggregate([
        { $match: { clinicId: CLINIC_ID, isActive: true } },
        { $limit: 20 },
        {
          $lookup: {
            from: 'encounters',
            localField: '_id',
            foreignField: 'patientId',
            as: 'encounters',
          },
        },
        { $addFields: { openEncounters: { $size: '$encounters' } } },
        { $project: { firstName: 1, lastName: 1, openEncounters: 1 } },
      ])
    );
    console.log(`[qperf] patient+encounter lookup (20 patients): ${ms}ms`);
    // Lookup on unindexed patientId can be slow; budget is generous
    expect(ms).toBeLessThan(2000);
  });
});
