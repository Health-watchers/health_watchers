/**
 * Tests for the HIPAA Right of Access patient data-export flow (#636):
 * POST /api/v1/portal/export-request
 * GET  /api/v1/portal/export-requests
 * GET  /api/v1/portal/export/download/:token
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

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

jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/patients/patients.controller', () => ({ patientRoutes: require('express').Router() }));
jest.mock('@api/modules/encounters/encounters.controller', () => ({ encounterRoutes: require('express').Router() }));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({ appointmentRoutes: require('express').Router() }));
jest.mock('@api/modules/clinics/clinics.controller', () => ({ clinicRoutes: require('express').Router() }));
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
jest.mock('@api/services/token-denylist.service', () => ({
  isDenylisted: jest.fn().mockResolvedValue(false),
  isInvalidatedForUser: jest.fn().mockResolvedValue(false),
}));
jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/lib/email.service', () => ({
  sendDataExportReadyEmail: jest.fn(),
}));
jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findById: jest.fn(() => ({ lean: jest.fn().mockResolvedValue({ email: 'patient@example.com' }) })) },
}));

// Mock the heavy record-building service so we don't need a database.
jest.mock('./export-request.service', () => ({
  buildComprehensiveRecord: jest.fn().mockResolvedValue({
    patient: { systemId: 'P-001', firstName: 'Jane', lastName: 'Doe' },
    encounters: [],
    diagnoses: [],
    medications: [],
    labResults: [],
    immunizations: [],
    billing: [],
  }),
  renderJson: jest.fn(() => ({ status: 'success', data: {} })),
  renderCsv: jest.fn(() => 'a,b\n1,2'),
  renderFhir: jest.fn(() => ({ resourceType: 'Bundle' })),
  streamPdf: jest.fn((res: any) => res.end(Buffer.from('%PDF'))),
}));

jest.mock('./export-request.model', () => ({
  ExportRequestModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { ExportRequestModel } from './export-request.model';
import { sendDataExportReadyEmail } from '@api/lib/email.service';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const CLINIC_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439044';

function patientToken(withPatient = true) {
  return jwt.sign(
    { userId: USER_ID, role: 'PATIENT', clinicId: CLINIC_ID, ...(withPatient ? { patientId: PATIENT_ID } : {}) },
    'test-access-secret-32-chars-long!!',
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

function makeExportReq(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    patientId: PATIENT_ID,
    clinicId: CLINIC_ID,
    requestedBy: USER_ID,
    formats: ['json', 'pdf', 'csv', 'fhir'],
    status: 'processing',
    requestedAt: new Date(),
    slaDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    downloadCount: 0,
    save: jest.fn().mockResolvedValue(undefined),
    toObject() {
      return { ...this };
    },
    ...overrides,
  };
}

describe('POST /api/v1/portal/export-request', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a request, fulfils it, and emails a secure download link', async () => {
    const doc = makeExportReq();
    (ExportRequestModel.create as jest.Mock).mockResolvedValue(doc);

    const res = await request(app)
      .post('/api/v1/portal/export-request')
      .set('Authorization', `Bearer ${patientToken()}`)
      .send({ formats: ['json', 'pdf'] });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.sla).toBeDefined();
    expect(res.body.downloadUrl).toMatch(/\/portal\/export\/download\//);
    expect(res.body.data.downloadTokenHash).toBeUndefined();
    expect(doc.status).toBe('ready');
    expect(sendDataExportReadyEmail).toHaveBeenCalledWith(
      'patient@example.com',
      expect.stringContaining('/portal/export/download/'),
      expect.any(Date)
    );
  });

  it('returns 403 for non-patient roles', async () => {
    const token = jwt.sign(
      { userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID },
      'test-access-secret-32-chars-long!!',
      { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
    );
    const res = await request(app)
      .post('/api/v1/portal/export-request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/portal/export-requests', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists the patient requests with SLA tracking', async () => {
    (ExportRequestModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([makeExportReq({ status: 'ready', fulfilledAt: new Date() })]) }),
    });

    const res = await request(app)
      .get('/api/v1/portal/export-requests')
      .set('Authorization', `Bearer ${patientToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sla.status).toBe('on_time');
  });
});

describe('GET /api/v1/portal/export/download/:token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('downloads JSON for a valid token', async () => {
    const doc = makeExportReq({ status: 'ready', downloadExpiresAt: new Date(Date.now() + 86400000) });
    (ExportRequestModel.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(doc),
    });

    const res = await request(app).get('/api/v1/portal/export/download/sometoken?format=json');

    expect(res.status).toBe(200);
    expect(doc.downloadCount).toBe(1);
  });

  it('returns 404 for an expired link', async () => {
    const doc = makeExportReq({ status: 'ready', downloadExpiresAt: new Date(Date.now() - 1000) });
    (ExportRequestModel.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(doc),
    });

    const res = await request(app).get('/api/v1/portal/export/download/sometoken?format=json');
    expect(res.status).toBe(404);
    expect(doc.status).toBe('expired');
  });

  it('returns 404 for an unknown token', async () => {
    (ExportRequestModel.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app).get('/api/v1/portal/export/download/badtoken?format=json');
    expect(res.status).toBe(404);
  });
});
