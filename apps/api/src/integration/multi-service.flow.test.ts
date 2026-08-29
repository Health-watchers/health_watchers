/**
 * Integration tests — multi-service end-to-end workflows.
 *
 * Runs a full business flow across modules on one in-memory MongoDB:
 *   clinic + admin (direct) → login (auth) → create patient (patients) →
 *   schedule appointment (appointments) → initiate + confirm payment (payments)
 *
 * This validates cross-module data consistency (IDs linking records, clinic
 * scoping) through the real HTTP layer.
 */
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.NODE_ENV = 'test';
process.env.STELLAR_NETWORK = 'testnet';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: 'GPLATFORM' },
    supportedAssets: ['XLM', 'USDC'],
    stellarServiceUrl: 'http://stellar-service:3002',
    geminiApiKey: '',
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/lib/email.service', () => {
  const handler = {
    get: (_target: unknown, prop: string | symbol) =>
      typeof prop === 'string' ? jest.fn() : undefined,
  };
  return new Proxy({}, handler);
});

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
  emitToUser: jest.fn(),
}));

jest.mock('@api/modules/schedules/schedules.service', () => ({
  isStaffAvailable: jest.fn().mockResolvedValue(true),
}));

jest.mock('@api/services/metrics.service', () => ({
  patientsCreatedTotal: { inc: jest.fn() },
  paymentsInitiatedTotal: { inc: jest.fn() },
  paymentsConfirmedTotal: { inc: jest.fn() },
}));

jest.mock('@api/utils/tracer', () => ({
  withSpan: jest.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
}));

jest.mock('@api/middlewares/fee-budget-check.middleware', () => ({
  feeBudgetCheck: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('@api/modules/payments/services/stellar-client', () => ({
  stellarClient: {
    verifyTransaction: jest.fn(),
    getBalance: jest.fn(),
    getFeeEstimate: jest.fn(),
    findPaths: jest.fn(),
    getOrderbook: jest.fn(),
    fundAccount: jest.fn(),
    createUsdcTrustline: jest.fn(),
    sponsorFeeBump: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';
import { authRoutes } from '../modules/auth/auth.controller';
import { patientRoutes } from '../modules/patients/patients.controller';
import { appointmentRoutes } from '../modules/appointments/appointments.controller';
import { paymentRoutes } from '../modules/payments/payments.controller';
import { AppointmentModel } from '../modules/appointments/appointment.model';
import { PaymentRecordModel } from '../modules/payments/models/payment-record.model';
import { PatientModel } from '../modules/patients/models/patient.model';
import { stellarClient } from '../modules/payments/services/stellar-client';
import { startTestDb, stopTestDb, clearDb, TestDb } from './helpers/test-db';
import { createClinicWithAdmin, createUser } from './helpers/factories';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/patients', patientRoutes);
  app.use('/api/v1/appointments', appointmentRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  return app;
}

const DESTINATION = 'GDESTINATION123456789012345678901234567890123456';

describe('multi-service end-to-end workflow', () => {
  let testDb: TestDb;
  let app: express.Express;

  beforeAll(async () => {
    testDb = await startTestDb();
    app = buildApp();
  });

  afterEach(async () => {
    await clearDb();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('runs clinic → login → patient → appointment → payment end to end', async () => {
    // 1. Seed a clinic + admin directly (the "existing tenant" fixture)
    const { clinic, admin } = await createClinicWithAdmin({ password: 'StrongPass123!' });
    const doctor = await createUser({ clinicId: clinic._id, role: 'DOCTOR' });

    // 2. Authenticate through the real login endpoint
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: 'StrongPass123!' });
    expect(login.status).toBe(200);
    const token = login.body.data.accessToken;

    // 3. Create a patient through the API
    const patientRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Maria',
        lastName: 'Garcia',
        dateOfBirth: '1985-03-22',
        sex: 'F',
        contactNumber: '+15559998877',
      });
    expect(patientRes.status).toBe(201);
    const patientId = patientRes.body.data._id;

    const patientDoc = await PatientModel.findById(patientId);
    expect(patientDoc).not.toBeNull();
    expect(patientDoc!.clinicId.toString()).toBe(clinic._id.toString());

    // 4. Schedule an appointment for that patient
    const apptRes = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        patientId,
        doctorId: doctor._id.toString(),
        scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        duration: 30,
        type: 'follow-up',
        chiefComplaint: 'Post-op review',
      });
    expect(apptRes.status).toBe(201);
    // Appointments use `id` in the response transformer (patients use `_id`)
    const appointmentId = apptRes.body.data.id;

    const appointmentDoc = await AppointmentModel.findById(appointmentId);
    expect(appointmentDoc).not.toBeNull();
    expect(appointmentDoc!.patientId.toString()).toBe(patientId);
    expect(appointmentDoc!.clinicId.toString()).toBe(clinic._id.toString());

    // 5. Initiate a payment
    const intentRes = await request(app)
      .post('/api/v1/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '25.00', destination: DESTINATION });
    expect(intentRes.status).toBe(201);
    const intentId = intentRes.body.data.intentId;

    const paymentDoc = await PaymentRecordModel.findOne({ intentId });
    expect(paymentDoc).not.toBeNull();
    expect(paymentDoc!.clinicId).toBe(clinic._id.toString());
    expect(paymentDoc!.status).toBe('pending');

    // 6. Confirm the payment through the Stellar verification path
    (stellarClient.verifyTransaction as jest.Mock).mockResolvedValue({
      found: true,
      transaction: {
        hash: 'multi-svc-tx-hash',
        from: 'GFROM',
        to: DESTINATION,
        amount: '25.0000000',
        asset: 'XLM',
        memo: intentRes.body.data.memo,
        timestamp: new Date().toISOString(),
        success: true,
      },
    });

    const confirmRes = await request(app)
      .patch(`/api/v1/payments/${intentId}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .send({ txHash: 'multi-svc-tx-hash' });
    expect(confirmRes.status).toBe(200);

    const confirmed = await PaymentRecordModel.findOne({ intentId });
    expect(confirmed!.status).toBe('confirmed');

    // 7. Cross-module consistency: patient, appointment and payment all belong
    //    to the same clinic and reference each other correctly
    const patientAgain = await request(app)
      .get(`/api/v1/patients/${patientId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(patientAgain.status).toBe(200);
    expect(patientAgain.body.data.firstName).toBe('Maria');

    const apptAgain = await request(app)
      .get(`/api/v1/appointments/${appointmentId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(apptAgain.status).toBe(200);
    expect(apptAgain.body.data.patientId).toBe(patientId);
  });
});
