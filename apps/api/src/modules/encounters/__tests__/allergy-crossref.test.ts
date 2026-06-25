/**
 * Tests for allergy cross-reference checking in POST /encounters/:id/prescriptions
 * Issue #645
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';
process.env.FIELD_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz012345';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
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

jest.mock('@api/lib/encrypt', () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));
jest.mock('@api/utils/logger', () => { const pino = require('pino'); return { __esModule: true, default: pino({ level: 'silent' }) }; });
jest.mock('pino-http', () => () => (_req: unknown, _res: unknown, next: () => void) => next());
jest.mock('@api/config/db', () => ({ connectDB: jest.fn().mockReturnValue(new Promise(() => {})) }));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/users/users.controller', () => ({ userRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/payments.controller', () => ({ paymentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/modules/webhooks/webhooks.controller', () => ({ webhookRoutes: require('express').Router() }));
jest.mock('@api/modules/audit/audit-logs.controller', () => ({ auditLogRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/icd10/icd10.controller', () => ({ icd10Routes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinic-settings.controller', () => ({ clinicSettingsRoutes: require('express').Router() }));
jest.mock('@api/modules/audit/audit.service', () => ({ auditLog: jest.fn() }));

// ── Model mocks ───────────────────────────────────────────────────────────────

const ALLERGY_ID  = '507f1f77bcf86cd799430001';
const PATIENT_ID  = '507f1f77bcf86cd799439033';
const CLINIC_ID   = '507f1f77bcf86cd799439011';
const DOCTOR_ID   = '507f1f77bcf86cd799439099';
const ENCOUNTER_ID = '507f1f77bcf86cd799430010';

const penicillinAllergy = {
  _id: ALLERGY_ID,
  allergen: 'Penicillin',
  allergenType: 'drug',
  reaction: 'Anaphylaxis',
  severity: 'life-threatening',
  isActive: true,
};

function makeEncounterDoc(overrides: Record<string, unknown> = {}) {
  const doc: any = {
    _id: ENCOUNTER_ID,
    patientId: PATIENT_ID,
    clinicId: CLINIC_ID,
    attendingDoctorId: DOCTOR_ID,
    chiefComplaint: 'Headache',
    status: 'open',
    isActive: true,
    prescriptions: [],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return doc;
}

const mockEncounterFindOne = jest.fn();
jest.mock('@api/modules/encounters/encounter.model', () => ({
  EncounterModel: {
    findOne: mockEncounterFindOne,
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    aggregate: jest.fn().mockResolvedValue([{ data: [], meta: [] }]),
  },
}));

const mockPatientFindById = jest.fn();
jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    findById: mockPatientFindById,
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('@api/modules/icd10/icd10.model', () => ({
  ICD10Model: { exists: jest.fn().mockResolvedValue(true) },
}));

const mockEmitToClinic = jest.fn();
jest.mock('@api/realtime/socket', () => ({ emitToClinic: mockEmitToClinic }));

jest.mock('@api/modules/cds/cds-rules-engine.js', () => ({
  __esModule: true,
  default: {
    getPatientContext: jest.fn().mockResolvedValue({}),
    evaluateRules: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@api/services/metrics.service', () => ({
  encountersCreatedTotal: { inc: jest.fn() },
}));

jest.mock('@api/modules/subscriptions/usage.service', () => ({
  incrementUsage: jest.fn().mockResolvedValue(undefined),
  checkSubscriptionLimit: jest.fn().mockReturnValue((_req: any, _res: any, next: any) => next()),
}));

jest.mock('@api/modules/encounters/encounter-validation.service', () => ({
  EncounterValidationService: jest.fn().mockImplementation(() => ({
    validateEncounterCreation: jest.fn().mockResolvedValue([]),
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { auditLog } from '@api/modules/audit/audit.service';

function makeToken(role = 'DOCTOR') {
  return jwt.sign(
    { userId: DOCTOR_ID, role, clinicId: CLINIC_ID },
    'test-access-secret-32-chars-long!!',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

const AUTH = `Bearer ${makeToken()}`;

const validRx = {
  drugName: 'Amoxicillin',
  dosage: '500mg',
  frequency: 'TID',
  duration: '7 days',
  route: 'oral',
  refillsAllowed: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/encounters/:id/prescriptions — allergy cross-reference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 409 when drug matches a known active allergy and no override provided', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    // Penicillin allergy — prescribing Penicillin should conflict
    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({ ...validRx, drugName: 'Penicillin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AllergyConflict');
    expect(res.body.allergy.allergen).toBe('Penicillin');
  });

  it('returns 409 when drug name contains the allergen (partial match)', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({ ...validRx, drugName: 'Penicillin VK' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AllergyConflict');
  });

  it('allows prescription when no allergy conflict exists', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({ ...validRx, drugName: 'Ibuprofen' });

    expect(res.status).toBe(201);
    expect(res.body.allergyWarnings).toBeUndefined();
  });

  it('allows prescription with valid allergyOverride and records audit log', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({
        ...validRx,
        drugName: 'Penicillin',
        allergyOverride: {
          allergyId: ALLERGY_ID,
          reason: 'No alternative available; patient consented',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.allergyWarnings).toHaveLength(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ALLERGY_OVERRIDE' }),
      expect.anything()
    );
  });

  it('emits prescription:allergy_warning Socket.IO event on override', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({
        ...validRx,
        drugName: 'Penicillin',
        allergyOverride: {
          allergyId: ALLERGY_ID,
          reason: 'Clinically necessary',
        },
      });

    expect(mockEmitToClinic).toHaveBeenCalledWith(
      CLINIC_ID,
      'prescription:allergy_warning',
      expect.objectContaining({
        drugName: 'Penicillin',
        allergen: 'Penicillin',
        severity: 'life-threatening',
      })
    );
  });

  it('returns 409 when allergyOverride has wrong allergyId', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({
        ...validRx,
        drugName: 'Penicillin',
        allergyOverride: {
          allergyId: '000000000000000000000000', // wrong id
          reason: 'Some reason',
        },
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AllergyConflict');
  });

  it('returns 409 when allergyOverride is missing reason', async () => {
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [penicillinAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({
        ...validRx,
        drugName: 'Penicillin',
        allergyOverride: {
          allergyId: ALLERGY_ID,
          reason: '', // empty reason
        },
      });

    expect(res.status).toBe(409);
  });

  it('ignores inactive allergies', async () => {
    const inactiveAllergy = { ...penicillinAllergy, isActive: false };
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [inactiveAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({ ...validRx, drugName: 'Penicillin' });

    expect(res.status).toBe(201);
  });

  it('ignores non-drug allergies', async () => {
    const foodAllergy = { ...penicillinAllergy, allergenType: 'food', allergen: 'Peanuts' };
    mockEncounterFindOne.mockResolvedValue(makeEncounterDoc());
    mockPatientFindById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ allergies: [foodAllergy] }),
      }),
    });

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send({ ...validRx, drugName: 'Peanut Oil Injection' });

    expect(res.status).toBe(201);
  });

  it('returns 404 when encounter not found', async () => {
    mockEncounterFindOne.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/encounters/${ENCOUNTER_ID}/prescriptions`)
      .set('Authorization', AUTH)
      .send(validRx);

    expect(res.status).toBe(404);
  });
});
