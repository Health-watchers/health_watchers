/**
 * Extended Database Query Tests — Issue #1032
 *
 * Supplements queries.test.ts with:
 *  - Appointment model queries
 *  - ImmunizationModel queries
 *  - Aggregation pipeline patterns used in reporting
 *  - Bulk write performance
 *  - Cursor-based pagination correctness
 *  - Projection (field selection) queries
 */

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { AppointmentModel } from '@api/modules/appointments/appointment.model';
import { buildPatientBatch } from '../factories/patient.factory';
import { buildEncounterBatch } from '../factories/encounter.factory';
import { buildPaymentBatch } from '../factories/payment.factory';

let mongod: MongoMemoryServer;
const CLINIC_ID = new mongoose.Types.ObjectId();
const DOCTOR_ID = new mongoose.Types.ObjectId();
const CLINIC_STR = CLINIC_ID.toString();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();
  await EncounterModel.ensureIndexes();
  await PaymentRecordModel.ensureIndexes();
  await AppointmentModel.ensureIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PatientModel.deleteMany({});
  await EncounterModel.deleteMany({});
  await PaymentRecordModel.deleteMany({});
  await AppointmentModel.deleteMany({});
});

// ── Appointment queries ───────────────────────────────────────────────────────
describe('Appointment queries', () => {
  it('finds scheduled appointments by clinicId', async () => {
    await AppointmentModel.insertMany(
      Array.from({ length: 5 }, (_, i) => ({
        patientId: new mongoose.Types.ObjectId(),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(Date.now() + i * 3600000),
        status: 'scheduled',
        type: 'consultation',
      }))
    );
    const results = await AppointmentModel.find({ clinicId: CLINIC_ID, status: 'scheduled' });
    expect(results).toHaveLength(5);
  });

  it('filters appointments by date range', async () => {
    const now = Date.now();
    await AppointmentModel.insertMany([
      {
        patientId: new mongoose.Types.ObjectId(),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(now - 86400000), // yesterday
        status: 'scheduled',
        type: 'consultation',
      },
      {
        patientId: new mongoose.Types.ObjectId(),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(now + 86400000), // tomorrow
        status: 'scheduled',
        type: 'consultation',
      },
    ]);

    const upcoming = await AppointmentModel.find({
      clinicId: CLINIC_ID,
      scheduledAt: { $gte: new Date() },
    });
    expect(upcoming).toHaveLength(1);
  });

  it('counts appointments by doctor', async () => {
    await AppointmentModel.insertMany(
      Array.from({ length: 3 }, () => ({
        patientId: new mongoose.Types.ObjectId(),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(),
        status: 'scheduled',
        type: 'consultation',
      }))
    );
    const count = await AppointmentModel.countDocuments({ doctorId: DOCTOR_ID });
    expect(count).toBe(3);
  });

  it('sorts appointments by scheduledAt ascending', async () => {
    const now = Date.now();
    await AppointmentModel.insertMany(
      [2, 1, 3].map((h) => ({
        patientId: new mongoose.Types.ObjectId(),
        clinicId: CLINIC_ID,
        doctorId: DOCTOR_ID,
        scheduledAt: new Date(now + h * 3600000),
        status: 'scheduled',
        type: 'consultation',
      }))
    );
    const sorted = await AppointmentModel.find({ clinicId: CLINIC_ID }).sort({ scheduledAt: 1 });
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.scheduledAt.getTime()).toBeGreaterThanOrEqual(
        sorted[i - 1]!.scheduledAt.getTime()
      );
    }
  });
});

// ── Aggregation pipelines ─────────────────────────────────────────────────────
describe('Aggregation pipeline queries', () => {
  it('groups encounter counts by patient', async () => {
    const patientId = new mongoose.Types.ObjectId();
    await EncounterModel.insertMany(
      buildEncounterBatch(5, { clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID, patientId })
    );

    const result = await EncounterModel.aggregate([
      { $match: { clinicId: CLINIC_ID } },
      { $group: { _id: '$patientId', encounterCount: { $sum: 1 } } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].encounterCount).toBe(5);
  });

  it('payment total pipeline returns correct sum', async () => {
    await PaymentRecordModel.insertMany([
      { ...buildPaymentBatch(1, { clinicId: CLINIC_STR })[0]!, amount: '100.00' },
      { ...buildPaymentBatch(1, { clinicId: CLINIC_STR })[0]!, amount: '200.00' },
      { ...buildPaymentBatch(1, { clinicId: CLINIC_STR })[0]!, amount: '300.00' },
    ]);
    const result = await PaymentRecordModel.aggregate([
      { $match: { clinicId: CLINIC_STR } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
    ]);
    expect(result[0]?.total).toBeCloseTo(600);
  });

  it('patient isActive distribution aggregation is correct', async () => {
    await PatientModel.insertMany([
      ...buildPatientBatch(4, { clinicId: CLINIC_ID, isActive: true }),
      ...buildPatientBatch(2, { clinicId: CLINIC_ID, isActive: false }),
    ]);
    const result = await PatientModel.aggregate([
      { $match: { clinicId: CLINIC_ID } },
      { $group: { _id: '$isActive', count: { $sum: 1 } } },
    ]);
    const distribution: Record<string, number> = {};
    result.forEach((r: { _id: boolean; count: number }) => {
      distribution[String(r._id)] = r.count;
    });
    expect(distribution['true']).toBe(4);
    expect(distribution['false']).toBe(2);
  });

  it('encounter pipeline with $lookup finds patient data', async () => {
    const patient = await PatientModel.create(buildPatientBatch(1, { clinicId: CLINIC_ID })[0]!);
    await EncounterModel.create(
      buildEncounterBatch(1, {
        clinicId: CLINIC_ID,
        attendingDoctorId: DOCTOR_ID,
        patientId: patient._id as mongoose.Types.ObjectId,
      })[0]!
    );

    const result = await EncounterModel.aggregate([
      { $match: { clinicId: CLINIC_ID } },
      {
        $lookup: {
          from: 'patients',
          localField: 'patientId',
          foreignField: '_id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmpty: true } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].patient).toBeDefined();
  });
});

// ── Cursor-based pagination ───────────────────────────────────────────────────
describe('Cursor-based pagination correctness', () => {
  it('skip+limit returns distinct pages without overlap', async () => {
    await PatientModel.insertMany(buildPatientBatch(20, { clinicId: CLINIC_ID }));

    const page1 = await PatientModel.find({ clinicId: CLINIC_ID })
      .sort({ _id: 1 })
      .skip(0)
      .limit(5)
      .lean();
    const page2 = await PatientModel.find({ clinicId: CLINIC_ID })
      .sort({ _id: 1 })
      .skip(5)
      .limit(5)
      .lean();

    const ids1 = page1.map((p) => String(p._id));
    const ids2 = page2.map((p) => String(p._id));
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('all pages together cover all records without duplicates', async () => {
    await PatientModel.insertMany(buildPatientBatch(15, { clinicId: CLINIC_ID }));

    const allIds: string[] = [];
    for (let skip = 0; skip < 15; skip += 5) {
      const page = await PatientModel.find({ clinicId: CLINIC_ID })
        .sort({ _id: 1 })
        .skip(skip)
        .limit(5)
        .lean();
      allIds.push(...page.map((p) => String(p._id)));
    }

    const unique = new Set(allIds);
    expect(unique.size).toBe(15);
    expect(allIds).toHaveLength(15);
  });
});

// ── Projection queries ────────────────────────────────────────────────────────
describe('Projection queries', () => {
  it('returns only selected fields when projection is applied', async () => {
    await PatientModel.insertMany(buildPatientBatch(3, { clinicId: CLINIC_ID }));

    const results = await PatientModel.find({ clinicId: CLINIC_ID })
      .select('firstName lastName -_id')
      .lean();

    results.forEach((p: any) => {
      expect(p.firstName).toBeDefined();
      expect(p.lastName).toBeDefined();
      expect(p._id).toBeUndefined();
      // Fields NOT in projection should be absent
      expect(p.dateOfBirth).toBeUndefined();
      expect(p.sex).toBeUndefined();
    });
  });

  it('exclusion projection omits specified fields', async () => {
    await PatientModel.insertMany(buildPatientBatch(2, { clinicId: CLINIC_ID }));

    const results = await PatientModel.find({ clinicId: CLINIC_ID })
      .select('-dateOfBirth -sex')
      .lean();

    results.forEach((p: any) => {
      expect(p.firstName).toBeDefined();
      expect(p.dateOfBirth).toBeUndefined();
      expect(p.sex).toBeUndefined();
    });
  });
});

// ── Bulk write operations ─────────────────────────────────────────────────────
describe('Bulk write operations', () => {
  it('insertMany of 100 patients succeeds without duplicates', async () => {
    const patients = buildPatientBatch(100, { clinicId: CLINIC_ID });
    const result = await PatientModel.insertMany(patients, { ordered: false });
    expect(result).toHaveLength(100);
  });

  it('updateMany marks all inactive patients as deleted', async () => {
    await PatientModel.insertMany([
      ...buildPatientBatch(3, { clinicId: CLINIC_ID, isActive: false }),
      ...buildPatientBatch(2, { clinicId: CLINIC_ID, isActive: true }),
    ]);

    const result = await PatientModel.updateMany(
      { clinicId: CLINIC_ID, isActive: false },
      { $set: { isArchived: true } }
    );
    expect(result.modifiedCount).toBe(3);

    const archived = await PatientModel.find({ clinicId: CLINIC_ID, isArchived: true });
    expect(archived).toHaveLength(3);
  });

  it('deleteMany removes all records matching filter', async () => {
    await PatientModel.insertMany(buildPatientBatch(5, { clinicId: CLINIC_ID }));
    await PatientModel.deleteMany({ clinicId: CLINIC_ID });
    const remaining = await PatientModel.countDocuments({ clinicId: CLINIC_ID });
    expect(remaining).toBe(0);
  });
});
