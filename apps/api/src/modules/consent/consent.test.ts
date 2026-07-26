/**
 * Unit tests for consent digital signature — #717
 * Covers: signature generation, hash verification, IP/userAgent capture, audit trail.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      refreshTokenSecret: 'abcdefghijklmnopqrstuvwxyz012345',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    apiPort: '3001',
    nodeEnv: 'test',
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: '',
  },
}));

jest.mock('@api/config/db', () => ({ connectDB: jest.fn().mockReturnValue(new Promise(() => {})) }));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Stub out unrelated route modules
jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/patients/patients.controller', () => ({ patientRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/modules/payments/services/claimable-expiry-notification-job', () => ({
  startClaimableExpiryNotificationJob: jest.fn(),
  stopClaimableExpiryNotificationJob: jest.fn(),
}));

// ConsentModel mock
const mockConsentDoc = {
  _id: '507f1f77bcf86cd799439099',
  patientId: '507f1f77bcf86cd799439011',
  clinicId: 'clinic_1',
  type: 'treatment',
  status: 'granted',
  signatureData: 'data:image/png;base64,abc123',
  signedAt: new Date('2026-01-01T10:00:00.000Z'),
  signatureHash: '',
  ipAddress: '127.0.0.1',
  userAgent: 'Jest/test',
};

jest.mock('@api/modules/consent/consent.model', () => {
  const CONSENT_TEMPLATES = {
    treatment: { version: '1.0', title: 'Consent for Treatment', text: 'I consent to receive medical treatment and care from this clinic.' },
    data_sharing: { version: '1.0', title: 'Consent for Data Sharing', text: 'I consent to the sharing of my health information with authorized parties for care coordination.' },
    ai_analysis: { version: '1.0', title: 'Consent for AI Analysis', text: 'I consent to the use of AI tools to analyze my health records to assist in my care.' },
    research: { version: '1.0', title: 'Consent for Research', text: 'I consent to the use of my de-identified health data for medical research purposes.' },
    marketing: { version: '1.0', title: 'Consent for Marketing Communications', text: 'I consent to receive health tips and promotional communications from this clinic.' },
  };
  return {
    ConsentModel: {
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate_: jest.fn(),
    },
    CONSENT_TEMPLATES,
    ConsentType: undefined,
  };
});

jest.mock('@api/modules/audit/audit.service', () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));

// ── Imports ───────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { ConsentModel, CONSENT_TEMPLATES } from './consent.model';
import { auditLog } from '../audit/audit.service';

const SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
const CLINIC_ID = 'clinic_1';
const PATIENT_ID = '507f1f77bcf86cd799439011';

function makeToken(role: string, clinicId: string = CLINIC_ID) {
  return jwt.sign(
    { userId: '507f1f77bcf86cd799439000', role, clinicId },
    SECRET,
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

const doctorToken = makeToken('DOCTOR');
const patientToken = makeToken('PATIENT');

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeExpectedHash(type: keyof typeof CONSENT_TEMPLATES, patientId: string, signedAt: Date) {
  const template = CONSENT_TEMPLATES[type];
  const data = `${template.text}${patientId}${signedAt.toISOString()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /patients/:id/consent — signature generation
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/patients/:id/consent — signature generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ConsentModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...mockConsentDoc,
      signatureHash: 'somehash',
    });
    (auditLog as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns 201 with consent record', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc123' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
  });

  it('stores signatureData in consent record', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,testSignature' });

    const updateCall = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0];
    expect(updateCall[1].signatureData).toBe('data:image/png;base64,testSignature');
  });

  it('generates SHA-256 signatureHash = hash(templateText + patientId + signedAt)', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc' });

    const updateCall = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0];
    const { signatureHash, signedAt } = updateCall[1];

    const expected = computeExpectedHash('treatment', PATIENT_ID, signedAt);
    expect(signatureHash).toBe(expected);
  });

  it('hash is a 64-char hex string', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc' });

    const { signatureHash } = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(signatureHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('captures ipAddress from request', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc' });

    const { ipAddress } = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(ipAddress).toBeDefined();
  });

  it('captures userAgent from request header', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc' });

    const { userAgent } = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(userAgent).toBe('TestBrowser/1.0');
  });

  it('prefers X-Forwarded-For over socket address for ipAddress', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .set('X-Forwarded-For', '203.0.113.1, 10.0.0.1')
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc' });

    const { ipAddress } = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(ipAddress).toBe('203.0.113.1');
  });

  it('sets status=granted and grantedAt', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'data:image/png;base64,abc' });

    const update = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1];
    expect(update.status).toBe('granted');
    expect(update.grantedAt).toBeInstanceOf(Date);
  });

  it('produces different hashes for different consent types', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'sig' });

    const hash1 = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1].signatureHash;
    jest.clearAllMocks();
    (ConsentModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...mockConsentDoc });

    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'research', signatureData: 'sig' });

    const hash2 = (ConsentModel.findOneAndUpdate as jest.Mock).mock.calls[0][1].signatureHash;
    expect(hash1).not.toBe(hash2);
  });

  it('returns 400 when signatureData is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when type is invalid', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'invalid_type', signatureData: 'sig' });

    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .send({ type: 'treatment', signatureData: 'sig' });

    expect(res.status).toBe(401);
  });

  it('writes audit log with event=consent_signed and signatureHash', async () => {
    await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ type: 'treatment', signatureData: 'sig' });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ event: 'consent_signed', signatureHash: expect.any(String) }),
      }),
      expect.anything()
    );
  });

  it('accepts PATIENT role', async () => {
    (ConsentModel.findOneAndUpdate as jest.Mock).mockResolvedValue({ ...mockConsentDoc });
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ type: 'treatment', signatureData: 'sig' });

    expect(res.status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /consent/:id/verify — signature verification
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/consent/:id/verify — signature verification', () => {
  const CONSENT_ID = '507f1f77bcf86cd799439099';

  function makeConsentWithHash(type: keyof typeof CONSENT_TEMPLATES = 'treatment') {
    const signedAt = new Date('2026-01-01T10:00:00.000Z');
    const hash = computeExpectedHash(type, PATIENT_ID, signedAt);
    return {
      _id: CONSENT_ID,
      patientId: PATIENT_ID,
      clinicId: CLINIC_ID,
      type,
      status: 'granted',
      signatureData: 'data:image/png;base64,abc123',
      signedAt,
      signatureHash: hash,
      toString: () => CONSENT_ID,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (auditLog as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns isValid=true for a correctly hashed consent', async () => {
    (ConsentModel.findById as jest.Mock).mockResolvedValue(makeConsentWithHash());

    const res = await request(app)
      .post(`/api/v1/consent/${CONSENT_ID}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(true);
  });

  it('returns isValid=false when hash has been tampered with', async () => {
    const consent = makeConsentWithHash();
    consent.signatureHash = 'deadbeef'.repeat(8); // wrong hash

    (ConsentModel.findById as jest.Mock).mockResolvedValue(consent);

    const res = await request(app)
      .post(`/api/v1/consent/${CONSENT_ID}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(false);
  });

  it('returns 404 when consent not found', async () => {
    (ConsentModel.findById as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/consent/${CONSENT_ID}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 when consent belongs to different clinic', async () => {
    const consent = makeConsentWithHash();
    (consent as any).clinicId = 'other_clinic';
    (ConsentModel.findById as jest.Mock).mockResolvedValue(consent);

    const res = await request(app)
      .post(`/api/v1/consent/${CONSENT_ID}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(404);
  });

  it('writes audit log with event=consent_verified', async () => {
    (ConsentModel.findById as jest.Mock).mockResolvedValue(makeConsentWithHash());

    await request(app)
      .post(`/api/v1/consent/${CONSENT_ID}/verify`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ event: 'consent_verified' }),
      }),
      expect.anything()
    );
  });

  it('hash recompute is deterministic for same inputs', () => {
    const signedAt = new Date('2026-06-01T12:00:00.000Z');
    const hash1 = computeExpectedHash('treatment', PATIENT_ID, signedAt);
    const hash2 = computeExpectedHash('treatment', PATIENT_ID, signedAt);
    expect(hash1).toBe(hash2);
  });

  it('hash changes when patientId changes', () => {
    const signedAt = new Date('2026-06-01T12:00:00.000Z');
    const h1 = computeExpectedHash('treatment', 'patient_A', signedAt);
    const h2 = computeExpectedHash('treatment', 'patient_B', signedAt);
    expect(h1).not.toBe(h2);
  });

  it('hash changes when timestamp changes', () => {
    const h1 = computeExpectedHash('treatment', PATIENT_ID, new Date('2026-01-01T00:00:00.000Z'));
    const h2 = computeExpectedHash('treatment', PATIENT_ID, new Date('2026-01-02T00:00:00.000Z'));
    expect(h1).not.toBe(h2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/consent
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/patients/:id/consent', () => {
  it('returns consent records for the patient', async () => {
    (ConsentModel.find as jest.Mock).mockReturnValue({ lean: () => Promise.resolve([mockConsentDoc]) });

    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/consent`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get(`/api/v1/patients/${PATIENT_ID}/consent`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Signature hash — unit-level tests (no HTTP)
// ─────────────────────────────────────────────────────────────────────────────

describe('Signature hash — unit tests', () => {
  it('SHA-256 of known input produces expected hex', () => {
    const text = 'I consent to receive medical treatment and care from this clinic.';
    const patientId = 'pat_001';
    const signedAt = new Date('2026-01-15T08:30:00.000Z');
    const data = `${text}${patientId}${signedAt.toISOString()}`;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('same inputs always produce the same hash', () => {
    const inputs = ['some content', 'patient_99', new Date('2026-03-01T00:00:00.000Z').toISOString()].join('');
    const h1 = crypto.createHash('sha256').update(inputs).digest('hex');
    const h2 = crypto.createHash('sha256').update(inputs).digest('hex');
    expect(h1).toBe(h2);
  });

  it('different content produces different hash', () => {
    const h1 = crypto.createHash('sha256').update('contentA').digest('hex');
    const h2 = crypto.createHash('sha256').update('contentB').digest('hex');
    expect(h1).not.toBe(h2);
  });
});
