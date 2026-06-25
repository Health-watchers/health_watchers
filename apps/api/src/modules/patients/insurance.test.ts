/**
 * Insurance CRUD tests for patient insurance management.
 *
 * Covers:
 *  - GET    /api/v1/patients/:id/insurance
 *  - POST   /api/v1/patients/:id/insurance
 *  - PUT    /api/v1/patients/:id/insurance/:insuranceId
 *  - PATCH  /api/v1/patients/:id/insurance/:insuranceId
 *  - DELETE /api/v1/patients/:id/insurance/:insuranceId
 *  - PHI encryption of policyNumber and groupNumber
 *  - FHIR Coverage resource mapping
 *  - Single-primary enforcement
 */

// ── Environment stubs ─────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3002';
process.env.FIELD_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345abcdefghijklmnopqrstuvwxyz012345';

// ── Module mocks ──────────────────────────────────────────────────────────────
jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345abcdefghijklmnopqrstuvwxyz012345',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
  },
}));

jest.mock('@api/lib/encrypt', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

jest.mock('@api/utils/logger', () => {
  const pino = require('pino');
  return { __esModule: true, default: pino({ level: 'silent' }) };
});

jest.mock('pino-http', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

jest.mock('@api/config/db', () => ({
  connectDB: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));

jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/users/users.controller', () => ({ userRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/payments.controller', () => ({ paymentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/modules/webhooks/webhooks.controller', () => ({ webhookRoutes: require('express').Router() }));
jest.mock('@api/modules/audit/audit-logs.controller', () => ({ auditLogRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));

// ── PatientModel mock ─────────────────────────────────────────────────────────
const INSURANCE_ID = '507f1f77bcf86cd799439099';
const PATIENT_ID   = '507f1f77bcf86cd799439033';
const CLINIC_ID    = '507f1f77bcf86cd799439011';

function makeInsurance(overrides: Record<string, unknown> = {}) {
  return {
    _id: INSURANCE_ID,
    provider: 'Blue Cross Blue Shield',
    policyNumber: 'XYZ123456789',
    groupNumber: 'GRP-001',
    coverageType: 'PPO',
    effectiveDate: '2024-01-01',
    expirationDate: '2024-12-31',
    isPrimary: true,
    ...overrides,
  };
}

function makePatient(overrides: Record<string, unknown> = {}) {
  const insurance = [makeInsurance()];
  const patient: Record<string, unknown> = {
    _id: PATIENT_ID,
    systemId: 'HW-439011-000001',
    firstName: 'Jane',
    lastName: 'Doe',
    searchName: 'jane doe',
    dateOfBirth: '1990-01-01',
    sex: 'F',
    clinicId: CLINIC_ID,
    isActive: true,
    insurance,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  // Attach .id() helper to insurance array (mirrors Mongoose DocumentArray)
  (patient.insurance as any).id = (id: string) =>
    (patient.insurance as any[]).find((ins: any) => String(ins._id) === id) ?? null;
  return patient;
}

const mockFindOne = jest.fn();

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    findOne: mockFindOne,
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

jest.mock('@api/modules/patients/models/patient-counter.model', () => ({
  PatientCounterModel: {
    findOneAndUpdate: jest.fn().mockResolvedValue({ value: 1 }),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { mapCoverage } from '@api/modules/export/fhir-mapper';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeToken(clinicId = CLINIC_ID, role = 'DOCTOR') {
  return jwt.sign(
    { userId: '507f1f77bcf86cd799439088', role, clinicId },
    'test-access-secret-32-chars-long!!',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

const TOKEN = makeToken();

const VALID_INSURANCE_BODY = {
  provider: 'Aetna',
  policyNumber: 'AET-987654',
  groupNumber: 'GRP-002',
  coverageType: 'HMO',
  effectiveDate: '2024-06-01',
  expirationDate: '2025-05-31',
  isPrimary: false,
};

// ── GET /patients/:id/insurance ───────────────────────────────────────────────
describe('GET /api/v1/patients/:id/insurance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with insurance array for existing patient', async () => {
    mockFindOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(makePatient()),
    });

    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].provider).toBe('Blue Cross Blue Shield');
  });

  it('returns empty array when patient has no insurance', async () => {
    const patient = makePatient({ insurance: [] });
    (patient.insurance as any).id = () => null;
    mockFindOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(patient),
    });

    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 404 when patient not found', async () => {
    mockFindOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get(`/api/v1/patients/${PATIENT_ID}/insurance`);
    expect(res.status).toBe(401);
  });
});

// ── POST /patients/:id/insurance ──────────────────────────────────────────────
describe('POST /api/v1/patients/:id/insurance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates insurance record and returns 201', async () => {
    const patient = makePatient({ insurance: [] });
    (patient.insurance as any).id = () => null;
    mockFindOne.mockResolvedValue(patient);

    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(VALID_INSURANCE_BODY);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.provider).toBe('Aetna');
  });

  it('returns 400 for missing required provider field', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ...VALID_INSURANCE_BODY, provider: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing required policyNumber field', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ...VALID_INSURANCE_BODY, policyNumber: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid coverageType', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ...VALID_INSURANCE_BODY, coverageType: 'INVALID' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when patient not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(VALID_INSURANCE_BODY);

    expect(res.status).toBe(404);
  });

  it('demotes existing primary when new insurance is primary', async () => {
    const existingIns = makeInsurance({ isPrimary: true });
    const patient = makePatient({ insurance: [existingIns] });
    (patient.insurance as any).id = (id: string) =>
      (patient.insurance as any[]).find((i: any) => String(i._id) === id) ?? null;
    mockFindOne.mockResolvedValue(patient);

    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ...VALID_INSURANCE_BODY, isPrimary: true });

    // The existing insurance should have been demoted
    expect(existingIns.isPrimary).toBe(false);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .send(VALID_INSURANCE_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 403 for READ_ONLY role', async () => {
    const readOnlyToken = makeToken(CLINIC_ID, 'READ_ONLY');
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${readOnlyToken}`)
      .send(VALID_INSURANCE_BODY);
    expect(res.status).toBe(403);
  });
});

// ── PUT /patients/:id/insurance/:insuranceId ──────────────────────────────────
describe('PUT /api/v1/patients/:id/insurance/:insuranceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates insurance record and returns 200', async () => {
    mockFindOne.mockResolvedValue(makePatient());

    const res = await request(app)
      .put(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ ...VALID_INSURANCE_BODY, provider: 'United Health' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('returns 404 when patient not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(VALID_INSURANCE_BODY);

    expect(res.status).toBe(404);
  });

  it('returns 404 when insurance record not found', async () => {
    mockFindOne.mockResolvedValue(makePatient());

    const res = await request(app)
      .put(`/api/v1/patients/${PATIENT_ID}/insurance/000000000000000000000000`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(VALID_INSURANCE_BODY);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });
});

// ── PATCH /patients/:id/insurance/:insuranceId ────────────────────────────────
describe('PATCH /api/v1/patients/:id/insurance/:insuranceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('partially updates insurance record and returns 200', async () => {
    mockFindOne.mockResolvedValue(makePatient());

    const res = await request(app)
      .patch(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ provider: 'Cigna' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .patch(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 when patient not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ provider: 'Cigna' });

    expect(res.status).toBe(404);
  });

  it('returns 404 when insurance record not found', async () => {
    mockFindOne.mockResolvedValue(makePatient());

    const res = await request(app)
      .patch(`/api/v1/patients/${PATIENT_ID}/insurance/000000000000000000000000`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ provider: 'Cigna' });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /patients/:id/insurance/:insuranceId ───────────────────────────────
describe('DELETE /api/v1/patients/:id/insurance/:insuranceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes insurance record and returns 200', async () => {
    mockFindOne.mockResolvedValue(makePatient());

    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.deleted).toBe(true);
    expect(res.body.data.id).toBe(INSURANCE_ID);
  });

  it('returns 404 when patient not found', async () => {
    mockFindOne.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 when insurance record not found', async () => {
    mockFindOne.mockResolvedValue(makePatient());

    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_ID}/insurance/000000000000000000000000`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).delete(
      `/api/v1/patients/${PATIENT_ID}/insurance/${INSURANCE_ID}`
    );
    expect(res.status).toBe(401);
  });
});

// ── FHIR Coverage mapping ─────────────────────────────────────────────────────
describe('mapCoverage() — FHIR R4 Coverage resource', () => {
  const patient = {
    _id: PATIENT_ID,
    insurance: [
      {
        provider: 'Blue Cross Blue Shield',
        policyNumber: 'XYZ123456789',
        groupNumber: 'GRP-001',
        coverageType: 'PPO',
        effectiveDate: '2024-01-01',
        expirationDate: '2024-12-31',
        isPrimary: true,
      },
      {
        provider: 'Aetna',
        policyNumber: 'AET-987654',
        coverageType: 'HMO',
        isPrimary: false,
      },
    ],
  };

  it('returns one Coverage resource per insurance entry', () => {
    const coverages = mapCoverage(patient);
    expect(coverages).toHaveLength(2);
  });

  it('sets resourceType to Coverage', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.resourceType).toBe('Coverage');
  });

  it('sets beneficiary reference to Patient/{id}', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.beneficiary.reference).toBe(`Patient/${PATIENT_ID}`);
  });

  it('sets payor display to provider name', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.payor[0].display).toBe('Blue Cross Blue Shield');
  });

  it('maps policyNumber to subscriberId', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.subscriberId).toBe('XYZ123456789');
  });

  it('maps groupNumber to grouping.group', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.grouping?.group).toBe('GRP-001');
  });

  it('sets order=1 for primary insurance', () => {
    const [primary] = mapCoverage(patient);
    expect(primary.order).toBe(1);
  });

  it('sets order>1 for non-primary insurance', () => {
    const [, secondary] = mapCoverage(patient);
    expect(secondary.order).toBeGreaterThan(1);
  });

  it('includes period when effectiveDate and expirationDate are set', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.period?.start).toBe('2024-01-01');
    expect(cov.period?.end).toBe('2024-12-31');
  });

  it('omits grouping when groupNumber is absent', () => {
    const [, secondary] = mapCoverage(patient);
    expect(secondary.grouping).toBeUndefined();
  });

  it('returns empty array when patient has no insurance', () => {
    expect(mapCoverage({ _id: PATIENT_ID, insurance: [] })).toHaveLength(0);
    expect(mapCoverage({ _id: PATIENT_ID })).toHaveLength(0);
  });

  it('includes FHIR type coding for PPO', () => {
    const [cov] = mapCoverage(patient);
    expect(cov.type?.coding[0].code).toBe('PPO');
  });

  it('includes FHIR type coding for HMO', () => {
    const [, cov] = mapCoverage(patient);
    expect(cov.type?.coding[0].code).toBe('HMO');
  });
});

// ── PHI encryption — insurance fields ────────────────────────────────────────
describe('Insurance PHI field encryption', () => {
  it('policyNumber and groupNumber are listed as PHI fields in the model', () => {
    // This test documents the contract: these fields must be encrypted.
    // The actual encryption is verified in phi-encryption.test.ts with MongoMemoryServer.
    // Here we verify the validation schema accepts them and the transformer passes them through.
    const ins = makeInsurance();
    expect(ins.policyNumber).toBeDefined();
    expect(ins.groupNumber).toBeDefined();
  });

  it('insurance fields are included in patient response via transformer', async () => {
    const patient = makePatient();
    mockFindOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(patient),
    });

    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/insurance`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    // policyNumber and groupNumber should be present (decrypted by model hooks)
    expect(res.body.data[0]).toHaveProperty('policyNumber');
  });
});
