import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { EncounterModel } from '@api/modules/encounters/encounter.model';
import { PaymentRecordModel } from '@api/modules/payments/models/payment-record.model';
import { buildPatient } from '../factories/patient.factory';
import { buildEncounter } from '../factories/encounter.factory';
import { buildPayment } from '../factories/payment.factory';

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ instance: { replSet: 'rs0' } });
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

describe('Database Transactions (ACID)', () => {
  describe('Atomicity', () => {
    it('commits both patient and encounter when transaction succeeds', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        const patient = await PatientModel.create([buildPatient({ clinicId })], { session });
        await EncounterModel.create(
          [buildEncounter({ clinicId, attendingDoctorId: doctorId, patientId: patient[0]!._id as mongoose.Types.ObjectId })],
          { session }
        );
      });

      session.endSession();

      const patients = await PatientModel.find({ clinicId });
      const encounters = await EncounterModel.find({ clinicId });
      expect(patients).toHaveLength(1);
      expect(encounters).toHaveLength(1);
    });

    it('rolls back all writes when transaction aborts', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const session = await mongoose.startSession();

      await expect(
        session.withTransaction(async () => {
          await PatientModel.create([buildPatient({ clinicId })], { session });
          throw new Error('Simulated failure — roll back');
        })
      ).rejects.toThrow('Simulated failure');

      session.endSession();

      const patients = await PatientModel.find({ clinicId });
      expect(patients).toHaveLength(0);
    });
  });

  describe('Consistency', () => {
    it('enforces unique intentId constraint within a transaction', async () => {
      const payment = buildPayment();
      await PaymentRecordModel.create(payment);

      const session = await mongoose.startSession();

      await expect(
        session.withTransaction(async () => {
          await PaymentRecordModel.create([{ ...buildPayment(), intentId: payment.intentId }], { session });
        })
      ).rejects.toThrow();

      session.endSession();

      const count = await PaymentRecordModel.countDocuments({ intentId: payment.intentId });
      expect(count).toBe(1);
    });

    it('enforces unique systemId constraint across concurrent creates', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const patient = buildPatient({ clinicId });
      await PatientModel.create(patient);

      await expect(PatientModel.create({ ...buildPatient({ clinicId }), systemId: patient.systemId })).rejects.toThrow();

      const count = await PatientModel.countDocuments({ systemId: patient.systemId });
      expect(count).toBe(1);
    });
  });

  describe('Isolation', () => {
    it('uncommitted changes are not visible outside the session', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const session = await mongoose.startSession();
      session.startTransaction();

      await PatientModel.create([buildPatient({ clinicId })], { session });

      const outsideCount = await PatientModel.countDocuments({ clinicId });
      expect(outsideCount).toBe(0);

      await session.abortTransaction();
      session.endSession();
    });
  });

  describe('Durability', () => {
    it('committed data survives a reconnect', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        await PatientModel.create([buildPatient({ clinicId })], { session });
      });

      session.endSession();

      await mongoose.disconnect();
      await mongoose.connect(mongod.getUri());

      const count = await PatientModel.countDocuments({ clinicId });
      expect(count).toBe(1);
    });
  });

  describe('Multi-document transaction', () => {
    it('creates patient, encounter, and payment atomically', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const clinicStr = clinicId.toString();
      const session = await mongoose.startSession();

      await session.withTransaction(async () => {
        const [patient] = await PatientModel.create([buildPatient({ clinicId })], { session });
        const [encounter] = await EncounterModel.create(
          [buildEncounter({ clinicId, attendingDoctorId: doctorId, patientId: patient!._id as mongoose.Types.ObjectId })],
          { session }
        );
        await PaymentRecordModel.create(
          [buildPayment({ clinicId: clinicStr, encounterId: (encounter!._id as mongoose.Types.ObjectId).toString() })],
          { session }
        );
      });

      session.endSession();

      expect(await PatientModel.countDocuments({ clinicId })).toBe(1);
      expect(await EncounterModel.countDocuments({ clinicId })).toBe(1);
      expect(await PaymentRecordModel.countDocuments({ clinicId: clinicStr })).toBe(1);
    });

    it('rolls back all three collections when one write fails', async () => {
      const clinicId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const clinicStr = clinicId.toString();
      const session = await mongoose.startSession();

      const duplicateIntentId = `dup-intent-${Date.now()}`;
      await PaymentRecordModel.create(buildPayment({ intentId: duplicateIntentId }));

      await expect(
        session.withTransaction(async () => {
          const [patient] = await PatientModel.create([buildPatient({ clinicId })], { session });
          await EncounterModel.create(
            [buildEncounter({ clinicId, attendingDoctorId: doctorId, patientId: patient!._id as mongoose.Types.ObjectId })],
            { session }
          );
          await PaymentRecordModel.create(
            [buildPayment({ clinicId: clinicStr, intentId: duplicateIntentId })],
            { session }
          );
        })
      ).rejects.toThrow();

      session.endSession();

      expect(await PatientModel.countDocuments({ clinicId })).toBe(0);
      expect(await EncounterModel.countDocuments({ clinicId })).toBe(0);
    });
  });
});
