import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '@api/app';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { EncounterModel } from '../../modules/encounters/encounter.model';
import { PaymentRecordModel } from '../../modules/payments/models/payment-record.model';
import { UserModel } from '../../modules/auth/models/user.model';
import { cache } from '../../services/cache.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePatients(clinicId: string, n: number) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    systemId: `P${i}`,
    firstName: 'Test',
    lastName: `Patient${i}`,
    searchName: `test patient${i}`,
    dateOfBirth: '1990-01-01',
    sex: 'M',
    clinicId,
    isActive: true,
    createdAt: new Date(now - i * 1000),
  }));
}

function makeEncounters(clinicId: string, patientId: string, n: number) {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    patientId,
    clinicId,
    attendingDoctorId: new mongoose.Types.ObjectId(),
    chiefComplaint: `Complaint ${i}`,
    status: 'open',
    createdAt: new Date(now - i * 1000),
  }));
}

function makePayments(clinicId: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    intentId: `intent-perf-${i}`,
    amount: '50',
    destination: 'GDEST',
    status: 'pending',
    clinicId,
    assetCode: 'XLM',
  }));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;
let authToken: string;
const CLINIC_ID = new mongoose.Types.ObjectId().toString();

const PATIENT_COUNT = 10_000;
const ENCOUNTER_COUNT = 50_000;
const PAYMENT_COUNT = 5_000;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Ensure indexes are created
  await PatientModel.ensureIndexes();
  await EncounterModel.ensureIndexes();
  await PaymentRecordModel.ensureIndexes();

  // Seed large dataset
  const patientId = new mongoose.Types.ObjectId();

  await PatientModel.insertMany(makePatients(CLINIC_ID, PATIENT_COUNT), { ordered: false });
  await EncounterModel.insertMany(makeEncounters(CLINIC_ID, String(patientId), ENCOUNTER_COUNT), { ordered: false });
  await PaymentRecordModel.insertMany(makePayments(CLINIC_ID, PAYMENT_COUNT), { ordered: false });

  // Create a test user and get a token
  const user = await UserModel.create({
    email: 'perf@clinic.test',
    password: '$2b$10$hashedpassword',
    firstName: 'Perf',
    lastName: 'Test',
    role: 'CLINIC_ADMIN',
    clinicId: CLINIC_ID,
    isActive: true,
  });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'perf@clinic.test', password: 'Password123!' });

  authToken = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken ?? '';
}, 120_000); // seeding 65k docs may take time

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard performance', () => {
  const TARGET_MS = 500;

  it(`cold query (no cache) resolves in < ${TARGET_MS}ms with ${PATIENT_COUNT} patients`, async () => {
    // Disable cache for this test
    jest.spyOn(cache, 'get').mockResolvedValueOnce(null);
    jest.spyOn(cache, 'set').mockResolvedValueOnce(undefined);

    const start = Date.now();
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${authToken}`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    console.log(`[perf] cold dashboard query: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(TARGET_MS);
  });

  it('cached response resolves in < 50ms', async () => {
    // Warm the cache
    await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${authToken}`);

    const start = Date.now();
    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${authToken}`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    console.log(`[perf] cached dashboard query: ${elapsed}ms`);
    expect(elapsed).toBeLessThan(50);
  });

  it('?refresh=true bypasses cache and returns fresh data', async () => {
    // Prime the cache
    await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${authToken}`);

    const getCacheSpy = jest.spyOn(cache, 'get');

    const res = await request(app)
      .get('/api/v1/dashboard/stats?refresh=true')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    // cache.get should NOT have been called when refresh=true
    expect(getCacheSpy).not.toHaveBeenCalled();
    getCacheSpy.mockRestore();
  });
});
