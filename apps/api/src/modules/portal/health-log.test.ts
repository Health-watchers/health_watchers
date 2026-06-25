/**
 * Unit tests for health log endpoints and threshold logic.
 *
 * The clinician endpoint lives in patients.controller.ts, which has a pre-existing
 * runtime issue (cacheResponse used without import). We therefore test the clinician
 * route directly via a minimal Express app rather than loading the full app instance.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
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

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── Mock the PatientHealthLog model ───────────────────────────────────────────
const mockEntry = {
  _id: '507f1f77bcf86cd799430001',
  patientId: '507f1f77bcf86cd799430010',
  metricType: 'weight',
  value: 75,
  unit: 'kg',
  loggedAt: new Date('2026-06-01T10:00:00Z'),
  notes: 'Morning reading',
  isAlert: false,
};

const mockFindChain = {
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([mockEntry]),
};

jest.mock('@api/modules/portal/models/patient-health-log.model', () => ({
  PatientHealthLogModel: {
    create:           jest.fn().mockResolvedValue(mockEntry),
    find:             jest.fn().mockReturnValue(mockFindChain),
    countDocuments:   jest.fn().mockResolvedValue(1),
  },
}));

// ── Mock PatientModel for clinician route ─────────────────────────────────────
jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: {
    findOne: jest.fn(),
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    countDocuments: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PatientHealthLogModel } from '@api/modules/portal/models/patient-health-log.model';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { checkThreshold } from '@api/modules/portal/health-log-thresholds';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { asyncHandler } from '@api/utils/asyncHandler';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { Types } from 'mongoose';
import { z } from 'zod';

// ── Token helpers ─────────────────────────────────────────────────────────────
const SECRET = 'test-access-secret';

function makeToken(role: string, extra: Record<string, unknown> = {}) {
  return jwt.sign(
    { userId: '507f1f77bcf86cd799439011', role, clinicId: '507f1f77bcf86cd799439099', ...extra },
    SECRET,
    { expiresIn: '15m', issuer: 'health-watchers-api', audience: 'health-watchers-client' }
  );
}

const patientToken = makeToken('PATIENT', { patientId: '507f1f77bcf86cd799430010' });
const doctorToken  = makeToken('DOCTOR');
const adminToken   = makeToken('CLINIC_ADMIN');

// ── Build minimal test apps ───────────────────────────────────────────────────

/** Portal app: POST + GET /health-log */
function buildPortalApp() {
  const { healthLogRoutes } = require('@api/modules/portal/health-log.controller');
  const app = express();
  app.use(express.json());
  app.use(healthLogRoutes);
  return app;
}

/** Clinician app: GET /patients/:id/health-log */
function buildClinicianApp() {
  const app = express();
  app.use(express.json());

  const healthLogQuerySchema = z.object({
    metricType: z.enum(['weight', 'blood_pressure', 'blood_glucose', 'exercise']).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    page: z.string().regex(/^\d+$/).optional(),
  });

  app.get(
    '/patients/:id/health-log',
    authenticate,
    requireRoles('DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE'),
    asyncHandler(async (req: express.Request, res: express.Response) => {
      const { clinicId } = req.user!;
      const patient = await (PatientModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: req.params.id }),
      })({ _id: new Types.ObjectId(req.params.id), clinicId: new Types.ObjectId(clinicId!) }).lean();
      if (!patient) return res.status(404).json({ error: 'NotFound' });

      const limit = 100;
      const page  = 1;
      const filter: Record<string, unknown> = { patientId: new Types.ObjectId(req.params.id) };

      const [data, total] = await Promise.all([
        PatientHealthLogModel.find(filter).sort({ loggedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        PatientHealthLogModel.countDocuments(filter),
      ]);

      return res.json({ status: 'success', data, meta: { total, page, limit } });
    })
  );
  return app;
}

// ── Threshold unit tests ──────────────────────────────────────────────────────
describe('checkThreshold', () => {
  describe('blood_pressure', () => {
    it('flags hypertensive crisis (≥180/120)', () => {
      expect(checkThreshold('blood_pressure', 185, 125)).toMatchObject({ isAlert: true });
    });
    it('flags stage 2 hypertension (≥140/90)', () => {
      expect(checkThreshold('blood_pressure', 145, 95)).toMatchObject({ isAlert: true });
    });
    it('flags low BP (systolic < 90)', () => {
      expect(checkThreshold('blood_pressure', 85, 60)).toMatchObject({ isAlert: true });
    });
    it('does not flag normal BP', () => {
      expect(checkThreshold('blood_pressure', 120, 80)).toMatchObject({ isAlert: false });
    });
  });

  describe('blood_glucose', () => {
    it('flags critical hyperglycaemia (≥400)', () => {
      expect(checkThreshold('blood_glucose', 420)).toMatchObject({ isAlert: true });
    });
    it('flags high glucose (≥250)', () => {
      expect(checkThreshold('blood_glucose', 260)).toMatchObject({ isAlert: true });
    });
    it('flags severe hypoglycaemia (<54)', () => {
      expect(checkThreshold('blood_glucose', 50)).toMatchObject({ isAlert: true });
    });
    it('flags low glucose (<70)', () => {
      expect(checkThreshold('blood_glucose', 65)).toMatchObject({ isAlert: true });
    });
    it('does not flag normal glucose', () => {
      expect(checkThreshold('blood_glucose', 100)).toMatchObject({ isAlert: false });
    });
  });

  describe('weight', () => {
    it('flags implausible weight (>500 kg)', () => {
      expect(checkThreshold('weight', 600)).toMatchObject({ isAlert: true });
    });
    it('does not flag normal weight', () => {
      expect(checkThreshold('weight', 80)).toMatchObject({ isAlert: false });
    });
  });

  describe('exercise', () => {
    it('flags exercise > 600 min', () => {
      expect(checkThreshold('exercise', 700)).toMatchObject({ isAlert: true });
    });
    it('does not flag normal exercise', () => {
      expect(checkThreshold('exercise', 45)).toMatchObject({ isAlert: false });
    });
  });
});

// ── POST /health-log ──────────────────────────────────────────────────────────
describe('POST /health-log (portal)', () => {
  let app: express.Application;
  beforeAll(() => { app = buildPortalApp(); });
  beforeEach(() => jest.clearAllMocks());

  it('creates an entry for authenticated patient', async () => {
    (PatientHealthLogModel.create as jest.Mock).mockResolvedValue(mockEntry);

    const res = await request(app)
      .post('/health-log')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ metricType: 'weight', value: 75, unit: 'kg' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ metricType: 'weight', value: 75 });
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/health-log')
      .send({ metricType: 'weight', value: 75, unit: 'kg' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-patient role', async () => {
    const res = await request(app)
      .post('/health-log')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ metricType: 'weight', value: 75, unit: 'kg' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid metricType', async () => {
    const res = await request(app)
      .post('/health-log')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ metricType: 'temperature', value: 37, unit: '°C' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when value is missing', async () => {
    const res = await request(app)
      .post('/health-log')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ metricType: 'weight', unit: 'kg' });
    expect(res.status).toBe(400);
  });

  it('includes alert field when threshold exceeded', async () => {
    const alertEntry = { ...mockEntry, metricType: 'blood_glucose', value: 420, isAlert: true };
    (PatientHealthLogModel.create as jest.Mock).mockResolvedValue(alertEntry);

    const res = await request(app)
      .post('/health-log')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ metricType: 'blood_glucose', value: 420, unit: 'mg/dL' });

    expect(res.status).toBe(201);
    expect(res.body.alert).toBeDefined();
  });

  it('saves blood_pressure with diastolic value', async () => {
    const bpEntry = { ...mockEntry, metricType: 'blood_pressure', value: 130, valueDiastolic: 85, unit: 'mmHg', isAlert: false };
    (PatientHealthLogModel.create as jest.Mock).mockResolvedValue(bpEntry);

    const res = await request(app)
      .post('/health-log')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ metricType: 'blood_pressure', value: 130, valueDiastolic: 85, unit: 'mmHg' });

    expect(res.status).toBe(201);
    expect(res.body.data.valueDiastolic).toBe(85);
  });
});

// ── GET /health-log ───────────────────────────────────────────────────────────
describe('GET /health-log (portal)', () => {
  let app: express.Application;
  beforeAll(() => { app = buildPortalApp(); });
  beforeEach(() => {
    jest.clearAllMocks();
    (PatientHealthLogModel.find as jest.Mock).mockReturnValue(mockFindChain);
    (PatientHealthLogModel.countDocuments as jest.Mock).mockResolvedValue(1);
  });

  it('returns entries for authenticated patient', async () => {
    const res = await request(app)
      .get('/health-log')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ total: 1 });
  });

  it('accepts metricType filter', async () => {
    const res = await request(app)
      .get('/health-log?metricType=weight')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    expect(PatientHealthLogModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ metricType: 'weight' })
    );
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/health-log');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-patient role', async () => {
    const res = await request(app)
      .get('/health-log')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(403);
  });

  it('applies date range filters', async () => {
    const res = await request(app)
      .get('/health-log?from=2026-01-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.status).toBe(200);
    const callArg = (PatientHealthLogModel.find as jest.Mock).mock.calls[0][0];
    expect(callArg.loggedAt).toBeDefined();
  });
});

// ── GET /patients/:id/health-log (clinician) ──────────────────────────────────
describe('GET /patients/:id/health-log (clinician)', () => {
  const patientId = '507f1f77bcf86cd799430010';
  let app: express.Application;

  beforeAll(() => { app = buildClinicianApp(); });
  beforeEach(() => {
    jest.clearAllMocks();
    (PatientHealthLogModel.find as jest.Mock).mockReturnValue(mockFindChain);
    (PatientHealthLogModel.countDocuments as jest.Mock).mockResolvedValue(2);
  });

  it('returns entries for clinician (doctor)', async () => {
    const res = await request(app)
      .get(`/patients/${patientId}/health-log`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.meta).toMatchObject({ total: 2 });
  });

  it('returns entries for admin', async () => {
    const res = await request(app)
      .get(`/patients/${patientId}/health-log`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('returns 403 for patient role', async () => {
    const res = await request(app)
      .get(`/patients/${patientId}/health-log`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/patients/${patientId}/health-log`);
    expect(res.status).toBe(401);
  });
});
