/**
 * Allergy tracking & drug interaction alert tests — Issue #366
 *
 * Covers:
 *  - POST /api/v1/patients/:id/allergies
 *  - GET  /api/v1/patients/:id/allergies
 *  - PUT  /api/v1/patients/:id/allergies/:allergyId
 *  - DELETE /api/v1/patients/:id/allergies/:allergyId
 *  - POST /api/v1/encounters — allergy match blocks, no match passes, override flow
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

// ── Patient model mock ────────────────────────────────────────────────────────
const ALLERGY_ID = '507f1f77bcf86cd799430001';
const PATIENT_ID = '507f1f77bcf86cd799439033';
const CLINIC_A   = '507f1f77bcf86cd799439011';
const DOCTOR_ID  = '507f1f77bcf86cd799439099';

const mockAllergy = {
  _id: ALLERGY_ID,
  allergen: 'Penicillin',
  allergenType: 'drug',
  reaction: 'Anaphylaxis',
  severity: 'life-threatening',
  isActive: true,
  recordedBy: DOCTOR_ID,
  recordedAt: new Date(),
};

function makePatientDoc(allergies: unknown[] = []) {
  const doc = {
    _id: PATIENT_ID,
    systemId: 'HW-439011-000001',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-01',
    sex: 'F',
    clinicId: CLINIC_A,
    isActive: true,
    allergies,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    save: jest.fn().mockResolvedValue(undefined),
  };
  // Simulate Mongoose subdocument .id() lookup
  (doc as any).allergies.id = (id: string) =>
    (doc.allergies as any[]).find((a) => String(a._id) === id) ?? null;
  return doc;
}

const mockPatientFindOne = jest.fn();
const mockPatientFindById = jest.fn();
const mockPatientCreate = jest.fn();
const mockPatientCountDocuments = jest.fn().mockResolvedValue(0);
const mockPatientFind = jest.fn().mockResolvedValue([]);

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    create: mockPatientCreate,
    find: mockPatientFind,
    findById: mockPatientFindById,
    findOne: mockPatientFindOne,
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: mockPatientCountDocuments,
  },
}));

jest.mock('@api/modules/patients/models/patient-counter.model', () => ({
  PatientCounterModel: { findOneAndUpdate: jest.fn().mockResolvedValue({ value: 1 }) },
}));

// ── Encounter model mock ──────────────────────────────────────────────────────
const mockEncounterCreate = jest.fn();
jest.mock('@api/modules/encounters/encounter.model', () => ({
  EncounterModel: {
    create: mockEncounterCreate,
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('@api/modules/icd10/icd10.model', () => ({
  ICD10Model: { exists: jest.fn().mockResolvedValue(true) },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';

function makeToken(role = 'DOCTOR') {
  return jwt.sign(
    { userId: DOCTOR_ID, role, clinicId: CLINIC_A },
    'test-access-secret-32-chars-long!!',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' },
  );
}

const AUTH = `Bearer ${makeToken()}`;

// ── Allergy CRUD ──────────────────────────────────────────────────────────────
describe('GET /api/v1/patients/:id/allergies', () => {
  it('returns active allergies for the patient', async () => {
    mockPatientFindOne.mockResolvedValueOnce(makePatientDoc([mockAllergy]));
    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/allergies`)
      .set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].allergen).toBe('Penicillin');
  });

  it('returns 404 when patient not found', async () => {
    mockPatientFindOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/allergies`)
      .set('Authorization', AUTH);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/patients/:id/allergies', () => {
  const payload = {
    allergen: 'Amoxicillin',
    allergenType: 'drug',
    reaction: 'Rash',
    severity: 'moderate',
  };

  it('adds an allergy and returns 201', async () => {
    const doc = makePatientDoc([]);
    doc.save.mockResolvedValueOnce(undefined);
    mockPatientFindOne.mockResolvedValueOnce(doc);
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/allergies`)
      .set('Authorization', AUTH)
      .send(payload);
    expect(res.status).toBe(201);
    expect(doc.save).toHaveBeenCalled();
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/allergies`)
      .set('Authorization', AUTH)
      .send({ allergen: 'X' }); // missing allergenType, reaction, severity
    expect(res.status).toBe(400);
  });

  it('returns 404 when patient not found', async () => {
    mockPatientFindOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/allergies`)
      .set('Authorization', AUTH)
      .send(payload);
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/patients/:id/allergies/:allergyId', () => {
  it('updates an existing allergy', async () => {
    const allergy = { ...mockAllergy };
    const doc = makePatientDoc([allergy]);
    mockPatientFindOne.mockResolvedValueOnce(doc);
    const res = await request(app)
      .put(`/api/v1/patients/${PATIENT_ID}/allergies/${ALLERGY_ID}`)
      .set('Authorization', AUTH)
      .send({ severity: 'severe' });
    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalled();
  });

  it('returns 404 when allergy not found', async () => {
    const doc = makePatientDoc([]);
    mockPatientFindOne.mockResolvedValueOnce(doc);
    const res = await request(app)
      .put(`/api/v1/patients/${PATIENT_ID}/allergies/${ALLERGY_ID}`)
      .set('Authorization', AUTH)
      .send({ severity: 'severe' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/patients/:id/allergies/:allergyId', () => {
  it('soft-deletes an allergy (isActive = false)', async () => {
    const allergy = { ...mockAllergy };
    const doc = makePatientDoc([allergy]);
    mockPatientFindOne.mockResolvedValueOnce(doc);
    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_ID}/allergies/${ALLERGY_ID}`)
      .set('Authorization', AUTH);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(allergy.isActive).toBe(false);
  });
});

// ── Encounter allergy check ───────────────────────────────────────────────────
describe('POST /api/v1/encounters — allergy check', () => {
  const baseEncounter = {
    patientId: PATIENT_ID,
    clinicId: CLINIC_A,
    attendingDoctorId: DOCTOR_ID,
    chiefComplaint: 'Sore throat',
    status: 'open',
  };

  it('blocks encounter when prescription matches a known allergy (no override)', async () => {
    mockPatientFindById.mockResolvedValueOnce({
      allergies: [mockAllergy],
    });
    // PatientModel.findById used in encounter controller
    const { PatientModel } = require('@api/modules/patients/models/patient.model');
    PatientModel.findById.mockResolvedValueOnce({ allergies: [mockAllergy] });

    const res = await request(app)
      .post('/api/v1/encounters')
      .set('Authorization', AUTH)
      .send({
        ...baseEncounter,
        prescriptions: [{ medication: 'Penicillin', dosage: '500mg', frequency: 'TID' }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('AllergyConflict');
    expect(res.body.allergy.allergen).toBe('Penicillin');
  });

  it('allows encounter when no allergy match', async () => {
    const { PatientModel } = require('@api/modules/patients/models/patient.model');
    PatientModel.findById.mockResolvedValueOnce({ allergies: [mockAllergy] });
    mockEncounterCreate.mockResolvedValueOnce({
      ...baseEncounter,
      _id: '507f1f77bcf86cd799430099',
      prescriptions: [{ medication: 'Ibuprofen', dosage: '400mg', frequency: 'BID' }],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/encounters')
      .set('Authorization', AUTH)
      .send({
        ...baseEncounter,
        prescriptions: [{ medication: 'Ibuprofen', dosage: '400mg', frequency: 'BID' }],
      });
    expect(res.status).toBe(201);
  });

  it('allows encounter when allergy override is provided with reason', async () => {
    const { PatientModel } = require('@api/modules/patients/models/patient.model');
    PatientModel.findById.mockResolvedValueOnce({ allergies: [mockAllergy] });
    mockEncounterCreate.mockResolvedValueOnce({
      ...baseEncounter,
      _id: '507f1f77bcf86cd799430098',
      prescriptions: [{
        medication: 'Penicillin',
        dosage: '500mg',
        frequency: 'TID',
        allergyOverride: { allergyId: ALLERGY_ID, reason: 'No alternative available, patient consented' },
      }],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/encounters')
      .set('Authorization', AUTH)
      .send({
        ...baseEncounter,
        prescriptions: [{
          medication: 'Penicillin',
          dosage: '500mg',
          frequency: 'TID',
          allergyOverride: { allergyId: ALLERGY_ID, reason: 'No alternative available, patient consented' },
        }],
      });
    expect(res.status).toBe(201);
  });

  it('allows encounter with no prescriptions regardless of allergies', async () => {
    mockEncounterCreate.mockResolvedValueOnce({
      ...baseEncounter,
      _id: '507f1f77bcf86cd799430097',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/encounters')
      .set('Authorization', AUTH)
      .send(baseEncounter);
    expect(res.status).toBe(201);
  });
});
