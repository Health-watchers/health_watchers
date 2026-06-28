import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { buildPatientBatch } from '../factories/patient.factory';
import { buildEncounterBatch } from '../factories/encounter.factory';
import { buildPaymentBatch, buildConfirmedPayment } from '../factories/payment.factory';

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

let mongod: MongoMemoryServer;
const CLINIC_ID = new mongoose.Types.ObjectId();
const DOCTOR_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await PatientModel.ensureIndexes();
  await EncounterModel.ensureIndexes();
  await PaymentRecordModel.ensureIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await PatientModel.deleteMany({});
  await EncounterModel.deleteMany({});
  await PaymentRecordModel.deleteMany({});
});

describe('Database Queries', () => {
  describe('Patient queries', () => {
    it('finds patients by clinicId', async () => {
      const patients = buildPatientBatch(5, { clinicId: CLINIC_ID });
      await PatientModel.insertMany(patients);

      const results = await PatientModel.find({ clinicId: CLINIC_ID });
      expect(results).toHaveLength(5);
    });

    it('filters active patients only', async () => {
      const active = buildPatientBatch(3, { clinicId: CLINIC_ID, isActive: true });
      const inactive = buildPatientBatch(2, { clinicId: CLINIC_ID, isActive: false });
      await PatientModel.insertMany([...active, ...inactive]);

      const results = await PatientModel.find({ clinicId: CLINIC_ID, isActive: true });
      expect(results).toHaveLength(3);
    });

    it('finds patient by systemId', async () => {
      const [patient] = buildPatientBatch(1, { clinicId: CLINIC_ID });
      await PatientModel.create(patient);

      const found = await PatientModel.findOne({ systemId: patient.systemId });
      expect(found).not.toBeNull();
      expect(found!.firstName).toBe(patient.firstName);
    });

    it('returns patients sorted by createdAt descending', async () => {
      const patients = buildPatientBatch(3, { clinicId: CLINIC_ID });
      await PatientModel.insertMany(patients);

      const results = await PatientModel.find({ clinicId: CLINIC_ID }).sort({ createdAt: -1 });
      expect(results).toHaveLength(3);
      const dates = results.map((p) => p.createdAt?.getTime() ?? 0);
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1]!);
      expect(dates[1]).toBeGreaterThanOrEqual(dates[2]!);
    });

    it('counts patients per clinic', async () => {
      await PatientModel.insertMany(buildPatientBatch(4, { clinicId: CLINIC_ID }));
      const count = await PatientModel.countDocuments({ clinicId: CLINIC_ID });
      expect(count).toBe(4);
    });

    it('supports searchName text-prefix match', async () => {
      const patient = buildPatientBatch(1, { clinicId: CLINIC_ID, searchName: 'alice smith' })[0]!;
      await PatientModel.create(patient);

      const found = await PatientModel.findOne({ searchName: /^alice/ });
      expect(found).not.toBeNull();
    });
  });

  describe('Encounter queries', () => {
    it('finds encounters by patientId', async () => {
      const patientId = new mongoose.Types.ObjectId();
      const encounters = buildEncounterBatch(3, { patientId, clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID });
      await EncounterModel.insertMany(encounters);

      const results = await EncounterModel.find({ patientId });
      expect(results).toHaveLength(3);
    });

    it('filters encounters by status', async () => {
      await EncounterModel.insertMany([
        ...buildEncounterBatch(2, { clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID, status: 'open' }),
        ...buildEncounterBatch(1, { clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID, status: 'closed' }),
      ]);

      const open = await EncounterModel.find({ clinicId: CLINIC_ID, status: 'open' });
      expect(open).toHaveLength(2);
    });

    it('retrieves encounter with vitalSigns embedded', async () => {
      const enc = {
        ...buildEncounterBatch(1, { clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID })[0]!,
        vitalSigns: { heartRate: 80, temperature: 98.6 },
      };
      await EncounterModel.create(enc);

      const found = await EncounterModel.findOne({ clinicId: CLINIC_ID });
      expect(found?.vitalSigns?.heartRate).toBe(80);
    });

    it('counts open encounters per clinic', async () => {
      await EncounterModel.insertMany(
        buildEncounterBatch(5, { clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID, status: 'open' })
      );
      const count = await EncounterModel.countDocuments({ clinicId: CLINIC_ID, status: 'open' });
      expect(count).toBe(5);
    });

    it('paginates encounters with skip and limit', async () => {
      await EncounterModel.insertMany(
        buildEncounterBatch(10, { clinicId: CLINIC_ID, attendingDoctorId: DOCTOR_ID })
      );
      const page = await EncounterModel.find({ clinicId: CLINIC_ID }).skip(5).limit(3);
      expect(page).toHaveLength(3);
    });
  });

  describe('PaymentRecord queries', () => {
    it('finds payments by clinicId', async () => {
      const clinicId = new mongoose.Types.ObjectId().toString();
      await PaymentRecordModel.insertMany(buildPaymentBatch(3, { clinicId }));

      const results = await PaymentRecordModel.find({ clinicId });
      expect(results).toHaveLength(3);
    });

    it('filters by payment status', async () => {
      const clinicId = new mongoose.Types.ObjectId().toString();
      await PaymentRecordModel.insertMany([
        ...buildPaymentBatch(2, { clinicId }),
        buildConfirmedPayment({ clinicId }),
      ]);

      const pending = await PaymentRecordModel.find({ clinicId, status: 'pending' });
      const confirmed = await PaymentRecordModel.find({ clinicId, status: 'confirmed' });
      expect(pending).toHaveLength(2);
      expect(confirmed).toHaveLength(1);
    });

    it('finds payment by intentId', async () => {
      const payment = buildPaymentBatch(1)[0]!;
      await PaymentRecordModel.create(payment);

      const found = await PaymentRecordModel.findOne({ intentId: payment.intentId });
      expect(found).not.toBeNull();
      expect(found!.amount).toBe(payment.amount);
    });

    it('aggregates total pending amount per clinic', async () => {
      const clinicId = new mongoose.Types.ObjectId().toString();
      await PaymentRecordModel.insertMany([
        { ...buildPaymentBatch(1, { clinicId })[0]!, amount: '50.00' },
        { ...buildPaymentBatch(1, { clinicId })[0]!, amount: '75.00' },
      ]);

      const agg = await PaymentRecordModel.aggregate([
        { $match: { clinicId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
      ]);
      expect(agg[0]?.total).toBeCloseTo(125);
    });
  });
});
