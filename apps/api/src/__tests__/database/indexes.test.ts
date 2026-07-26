import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { buildPatientBatch } from '../factories/patient.factory';
import { buildEncounterBatch } from '../factories/encounter.factory';
import { buildPaymentBatch } from '../factories/payment.factory';

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

let mongod: MongoMemoryServer;

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

async function explainFind(model: mongoose.Model<any>, filter: object) {
  return model.find(filter).explain('executionStats') as Promise<any>;
}

describe('Database Indexes', () => {
  describe('Patient indexes', () => {
    it('index exists on patients.clinicId', async () => {
      const info = await PatientModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('clinicId'))).toBe(true);
    });

    it('index exists on patients.searchName', async () => {
      const info = await PatientModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('searchName'))).toBe(true);
    });

    it('unique index on patients.systemId rejects duplicate', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const base = buildPatientBatch(1, { clinicId })[0]!;
      await PatientModel.create(base);
      await expect(PatientModel.create({ ...buildPatientBatch(1, { clinicId })[0]!, systemId: base.systemId })).rejects.toThrow();
    });

    it('clinicId query uses an index (not COLLSCAN)', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      await PatientModel.insertMany(buildPatientBatch(5, { clinicId }));

      const plan = await explainFind(PatientModel, { clinicId });
      const stage: string = plan?.executionStats?.executionStages?.stage ?? plan?.queryPlanner?.winningPlan?.stage ?? '';
      expect(stage).not.toBe('COLLSCAN');
    });

    it('isActive index exists for active-patient filtering', async () => {
      const info = await PatientModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('isActive'))).toBe(true);
    });
  });

  describe('Encounter indexes', () => {
    it('index exists on encounters.patientId', async () => {
      const info = await EncounterModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('patientId'))).toBe(true);
    });

    it('index exists on encounters.clinicId', async () => {
      const info = await EncounterModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('clinicId'))).toBe(true);
    });

    it('index exists on encounters.status', async () => {
      const info = await EncounterModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('status'))).toBe(true);
    });

    it('index exists on encounters.attendingDoctorId', async () => {
      const info = await EncounterModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('attendingDoctorId'))).toBe(true);
    });

    it('clinicId+status query uses an index (not COLLSCAN)', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      await EncounterModel.insertMany(
        buildEncounterBatch(5, { clinicId, attendingDoctorId: doctorId, status: 'open' })
      );

      const plan = await explainFind(EncounterModel, { clinicId, status: 'open' });
      const stage: string = plan?.executionStats?.executionStages?.stage ?? plan?.queryPlanner?.winningPlan?.stage ?? '';
      expect(stage).not.toBe('COLLSCAN');
    });

    it('isActive index exists for encounter filtering', async () => {
      const info = await EncounterModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('isActive'))).toBe(true);
    });
  });

  describe('PaymentRecord indexes', () => {
    it('unique index on paymentrecords.intentId rejects duplicate', async () => {
      const pay = buildPaymentBatch(1)[0]!;
      await PaymentRecordModel.create(pay);
      await expect(PaymentRecordModel.create({ ...buildPaymentBatch(1)[0]!, intentId: pay.intentId })).rejects.toThrow();
    });

    it('index exists on paymentrecords.clinicId', async () => {
      const info = await PaymentRecordModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('clinicId'))).toBe(true);
    });

    it('index exists on paymentrecords.status', async () => {
      const info = await PaymentRecordModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('status'))).toBe(true);
    });

    it('index exists on paymentrecords.txHash (sparse)', async () => {
      const info = await PaymentRecordModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('txHash'))).toBe(true);
    });

    it('clinicId query uses an index (not COLLSCAN)', async () => {
      const clinicId = new mongoose.Types.ObjectId().toString();
      await PaymentRecordModel.insertMany(buildPaymentBatch(5, { clinicId }));

      const plan = await explainFind(PaymentRecordModel, { clinicId });
      const stage: string = plan?.executionStats?.executionStages?.stage ?? plan?.queryPlanner?.winningPlan?.stage ?? '';
      expect(stage).not.toBe('COLLSCAN');
    });

    it('index exists on paymentrecords.encounterId', async () => {
      const info = await PaymentRecordModel.collection.indexInformation();
      const indexKeys = Object.values(info).map((idx: any) => idx.map((k: any) => k[0]));
      expect(indexKeys.some((keys) => keys.includes('encounterId'))).toBe(true);
    });
  });
});
