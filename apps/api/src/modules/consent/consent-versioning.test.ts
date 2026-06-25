/**
 * Tests for consent management versioning (Issue #697).
 */

// ── Environment stubs ─────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

// ── Mocks ─────────────────────────────────────────────────────────────────────
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
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/modules/patients/patients.controller', () => ({ patientRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/payments/payments.controller', () => ({ paymentRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
jest.mock('@api/modules/users/users.controller', () => ({ userRoutes: require('express').Router() }));
jest.mock('@api/modules/webhooks/webhooks.controller', () => ({ webhookRoutes: require('express').Router() }));
jest.mock('@api/modules/audit/audit-logs.controller', () => ({ auditLogRoutes: require('express').Router() }));

jest.mock('@api/config/db', () => ({ connectDB: jest.fn().mockReturnValue(new Promise(() => {})) }));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@api/lib/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendConsentVersionNotificationEmail: jest.fn(),
  sendMfaGracePeriodReminderEmail: jest.fn(),
}));

jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/modules/consent/consent.model', () => ({
  ConsentModel: {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn(),
  },
  CONSENT_TEMPLATES: {
    treatment: { version: '1.0', title: 'Consent for Treatment', text: 'I consent to treatment.' },
    data_sharing: { version: '1.0', title: 'Consent for Data Sharing', text: 'I consent to data sharing.' },
    ai_analysis: { version: '1.0', title: 'Consent for AI Analysis', text: 'I consent to AI analysis.' },
    research: { version: '1.0', title: 'Consent for Research', text: 'I consent to research.' },
    marketing: { version: '1.0', title: 'Consent for Marketing', text: 'I consent to marketing.' },
  },
}));

jest.mock('@api/modules/consent/consent-form.model', () => ({
  ConsentFormModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    find: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('@api/middlewares/rate-limit.middleware', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    authLimiter: pass, forgotPasswordLimiter: pass, aiLimiter: pass,
    paymentLimiter: pass, generalLimiter: pass,
  };
});

// ── Auth middleware mock — inject user into req ────────────────────────────────
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = {
      userId: '507f1f77bcf86cd799439011',
      role: testRole,
      clinicId: CLINIC_ID,
      patientId: testPatientId,
    };
    next();
  },
  requireRoles: (...roles: string[]) => (req: any, res: any, next: () => void) => {
    if (roles.includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────
import request from 'supertest';
import app from '@api/app';
import { ConsentFormModel } from '@api/modules/consent/consent-form.model';
import { ConsentModel } from '@api/modules/consent/consent.model';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { sendConsentVersionNotificationEmail } from '@api/lib/email.service';
import { auditLog } from '@api/modules/audit/audit.service';

// ── Test state ────────────────────────────────────────────────────────────────
const CLINIC_ID = '507f1f77bcf86cd799439011';
const PATIENT_ID = '507f1f77bcf86cd799439022';
const FORM_ID = '507f1f77bcf86cd799439033';

let testRole = 'CLINIC_ADMIN';
let testPatientId: string | undefined = undefined;

beforeEach(() => {
  jest.clearAllMocks();
  testRole = 'CLINIC_ADMIN';
  testPatientId = undefined;
});

// ── POST /api/v1/consent/forms ────────────────────────────────────────────────
describe('POST /api/v1/consent/forms', () => {
  it('creates a new consent form version', async () => {
    const form = { _id: FORM_ID, clinicId: CLINIC_ID, type: 'treatment', version: '2.0', content: 'Updated content.', effectiveDate: new Date() };
    (ConsentFormModel.create as jest.Mock).mockResolvedValue(form);
    (ConsentModel.find as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .post('/api/v1/consent/forms')
      .send({ type: 'treatment', version: '2.0', content: 'Updated content.', effectiveDate: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(ConsentFormModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'treatment', version: '2.0', clinicId: CLINIC_ID })
    );
  });

  it('notifies existing patients when a new version is published', async () => {
    const form = { _id: FORM_ID, clinicId: CLINIC_ID, type: 'treatment', version: '2.0', content: 'Updated.', effectiveDate: new Date() };
    (ConsentFormModel.create as jest.Mock).mockResolvedValue(form);
    (ConsentModel.find as jest.Mock).mockResolvedValue([{ patientId: PATIENT_ID }]);
    (PatientModel.find as jest.Mock).mockResolvedValue([
      { _id: PATIENT_ID, email: 'patient@clinic.com', firstName: 'John', lastName: 'Doe' },
    ]);

    await request(app)
      .post('/api/v1/consent/forms')
      .send({ type: 'treatment', version: '2.0', content: 'Updated.', effectiveDate: new Date().toISOString() });

    expect(sendConsentVersionNotificationEmail).toHaveBeenCalledWith(
      'patient@clinic.com', 'John Doe', 'treatment', '2.0'
    );
  });

  it('does not notify patients without email addresses', async () => {
    const form = { _id: FORM_ID, clinicId: CLINIC_ID, type: 'treatment', version: '2.0', content: 'Updated.', effectiveDate: new Date() };
    (ConsentFormModel.create as jest.Mock).mockResolvedValue(form);
    (ConsentModel.find as jest.Mock).mockResolvedValue([{ patientId: PATIENT_ID }]);
    (PatientModel.find as jest.Mock).mockResolvedValue([]); // no patients with email

    await request(app)
      .post('/api/v1/consent/forms')
      .send({ type: 'treatment', version: '2.0', content: 'Updated.', effectiveDate: new Date().toISOString() });

    expect(sendConsentVersionNotificationEmail).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admin roles', async () => {
    testRole = 'DOCTOR';
    const res = await request(app)
      .post('/api/v1/consent/forms')
      .send({ type: 'treatment', version: '2.0', content: 'Updated.', effectiveDate: new Date().toISOString() });

    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/consent/forms')
      .send({ type: 'treatment' }); // missing version, content, effectiveDate

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/consent/current-version ───────────────────────────────────────
describe('GET /api/v1/consent/current-version', () => {
  it('returns the latest consent form version', async () => {
    const form = { _id: FORM_ID, type: 'treatment', version: '2.0', content: 'Updated.', effectiveDate: new Date() };
    (ConsentFormModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(form) }),
    });

    const res = await request(app).get('/api/v1/consent/current-version?type=treatment');

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe('2.0');
  });

  it('falls back to static template when no versioned form exists', async () => {
    (ConsentFormModel.findOne as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    });

    const res = await request(app).get('/api/v1/consent/current-version?type=treatment');

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe('1.0');
  });

  it('returns 400 when type is not provided', async () => {
    const res = await request(app).get('/api/v1/consent/current-version');
    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/consent/re-consent ──────────────────────────────────────────
describe('POST /api/v1/consent/re-consent', () => {
  beforeEach(() => {
    testRole = 'PATIENT';
    testPatientId = PATIENT_ID;
  });

  it('records re-consent and links to the form version', async () => {
    const form = { _id: FORM_ID, clinicId: CLINIC_ID, type: 'treatment', version: '2.0', content: 'Updated.' };
    const consent = { _id: 'consent1', patientId: PATIENT_ID, type: 'treatment', version: '2.0', formVersion: FORM_ID };
    (ConsentFormModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(form) });
    (ConsentModel.findOneAndUpdate as jest.Mock).mockResolvedValue(consent);

    const res = await request(app)
      .post('/api/v1/consent/re-consent')
      .send({ type: 'treatment', formVersionId: FORM_ID, signatureData: 'base64sig==' });

    expect(res.status).toBe(201);
    expect(res.body.data.formVersion).toBe(FORM_ID);
    expect(ConsentModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: PATIENT_ID, type: 'treatment' }),
      expect.objectContaining({ version: '2.0', formVersion: FORM_ID }),
      expect.any(Object)
    );
  });

  it('records an audit log on re-consent', async () => {
    const form = { _id: FORM_ID, clinicId: CLINIC_ID, type: 'treatment', version: '2.0', content: 'Updated.' };
    const consent = { _id: 'consent1', patientId: PATIENT_ID };
    (ConsentFormModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(form) });
    (ConsentModel.findOneAndUpdate as jest.Mock).mockResolvedValue(consent);

    await request(app)
      .post('/api/v1/consent/re-consent')
      .send({ type: 'treatment', formVersionId: FORM_ID, signatureData: 'base64sig==' });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONSENT_VERSION_ACCEPTED' }),
      expect.anything()
    );
  });

  it('returns 404 when form version does not exist', async () => {
    (ConsentFormModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

    const res = await request(app)
      .post('/api/v1/consent/re-consent')
      .send({ type: 'treatment', formVersionId: FORM_ID, signatureData: 'base64sig==' });

    expect(res.status).toBe(404);
  });

  it('returns 403 when the user has no patientId (non-patient)', async () => {
    testRole = 'DOCTOR';
    testPatientId = undefined;
    const form = { _id: FORM_ID, clinicId: CLINIC_ID, type: 'treatment', version: '2.0', content: 'Updated.' };
    (ConsentFormModel.findOne as jest.Mock).mockReturnValue({ lean: jest.fn().mockResolvedValue(form) });

    const res = await request(app)
      .post('/api/v1/consent/re-consent')
      .send({ type: 'treatment', formVersionId: FORM_ID, signatureData: 'base64sig==' });

    expect(res.status).toBe(403);
  });
});
