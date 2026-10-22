/**
 * Break-the-glass emergency access workflow (#1493).
 */

// ── Mocks (must be before imports) ────────────────────────────────────────────

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
    stellarServiceUrl: '',
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Authenticate as whoever the test puts in the x-test-user header.
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, res: any, next: () => void) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ error: 'Unauthorized' });
    req.user = JSON.parse(raw);
    return next();
  },
  requireRoles:
    (...roles: string[]) =>
    (req: any, res: any, next: () => void) =>
      roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' }),
}));

jest.mock('@api/modules/patients/models/patient.model', () => ({
  PatientModel: { findById: jest.fn() },
}));

jest.mock('./emergency-access.model', () => {
  const actual = jest.requireActual('./emergency-access.model');
  return {
    ...actual,
    EmergencyAccessGrantModel: {
      findOne: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    },
  };
});

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { find: jest.fn(), findById: jest.fn() },
}));

jest.mock('@api/modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/modules/notifications/notification.service', () => ({
  createNotification: jest.fn().mockResolvedValue(null),
}));

jest.mock('@api/realtime/socket', () => ({
  emitToClinic: jest.fn(),
  emitToUser: jest.fn(),
}));

const cacheStore = new Map<string, unknown>();
jest.mock('@api/services/cache.service', () => ({
  cache: {
    get: jest.fn(async (key: string) => (cacheStore.has(key) ? cacheStore.get(key) : null)),
    set: jest.fn(async (key: string, value: unknown) => void cacheStore.set(key, value)),
    del: jest.fn(),
    delPattern: jest.fn(),
    invalidatePatientList: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import {
  emergencyAccessPatientRoutes,
  emergencyAccessReviewRoutes,
} from './emergency-access.controller';
import { patientRoutes } from '@api/modules/patients/patients.controller';
import { EmergencyAccessGrantModel } from './emergency-access.model';
import { isGrantActive } from './emergency-access.service';
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { UserModel } from '@api/modules/auth/models/user.model';
import { auditLog } from '@api/modules/audit/audit.service';
import { createNotification } from '@api/modules/notifications/notification.service';
import { emitToClinic } from '@api/realtime/socket';
import { cache } from '@api/services/cache.service';

const app = express();
app.use(express.json());
app.use('/api/v1/patients', emergencyAccessPatientRoutes);
app.use('/api/v1/patients', patientRoutes);
app.use('/api/v1/compliance/emergency-access', emergencyAccessReviewRoutes);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HOME_CLINIC = new Types.ObjectId().toHexString();
const OTHER_CLINIC = new Types.ObjectId().toHexString();
const PATIENT_ID = new Types.ObjectId().toHexString();
const DOCTOR_ID = new Types.ObjectId().toHexString();
const ADMIN_ID = new Types.ObjectId().toHexString();

const doctor = { userId: DOCTOR_ID, role: 'DOCTOR', clinicId: HOME_CLINIC };
const assistant = { userId: DOCTOR_ID, role: 'ASSISTANT', clinicId: HOME_CLINIC };
const patientAdmin = { userId: ADMIN_ID, role: 'CLINIC_ADMIN', clinicId: OTHER_CLINIC };
const unrelatedAdmin = {
  userId: new Types.ObjectId().toHexString(),
  role: 'CLINIC_ADMIN',
  clinicId: new Types.ObjectId().toHexString(),
};

const as = (user: object) => ({ 'x-test-user': JSON.stringify(user) });

const validBody = {
  reason: 'LIFE_THREATENING_EMERGENCY',
  justification: 'Unconscious patient brought into the ED, need allergy history',
};

function patientDoc(clinicId: string) {
  return {
    _id: new Types.ObjectId(PATIENT_ID),
    systemId: 'HW-000001',
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: new Date('1990-01-01'),
    sex: 'F',
    clinicId: new Types.ObjectId(clinicId),
    isActive: true,
  };
}

function grant(overrides: Record<string, unknown> = {}) {
  const grantedAt = new Date();
  return {
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(DOCTOR_ID),
    clinicId: new Types.ObjectId(HOME_CLINIC),
    patientId: new Types.ObjectId(PATIENT_ID),
    patientClinicId: new Types.ObjectId(OTHER_CLINIC),
    reason: 'LIFE_THREATENING_EMERGENCY',
    justification: validBody.justification,
    grantedAt,
    expiresAt: new Date(grantedAt.getTime() + 60 * 60_000),
    reviewStatus: 'PENDING',
    ...overrides,
  };
}

/** Chainable mongoose query stub resolving to `value`. */
function q(value: unknown) {
  const chain: any = {
    select: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    populate: () => chain,
    lean: () => chain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
  };
  return chain;
}

const Grant = EmergencyAccessGrantModel as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  cacheStore.clear();
  Grant.findOne.mockReturnValue(q(null));
  (UserModel.find as jest.Mock).mockReturnValue(
    q([
      { _id: new Types.ObjectId(ADMIN_ID), clinicId: new Types.ObjectId(OTHER_CLINIC) },
      { _id: new Types.ObjectId(), clinicId: new Types.ObjectId(HOME_CLINIC) },
    ])
  );
  (UserModel.findById as jest.Mock).mockReturnValue(q({ fullName: 'Dr. Who', role: 'DOCTOR' }));
});

// ── POST /patients/:id/emergency-access ───────────────────────────────────────

describe('POST /patients/:id/emergency-access', () => {
  beforeEach(() => {
    (PatientModel.findById as jest.Mock).mockReturnValue(q(patientDoc(OTHER_CLINIC)));
    Grant.create.mockImplementation(async (doc: Record<string, unknown>) => {
      const created = { _id: new Types.ObjectId(), ...doc };
      return { ...created, toObject: () => created };
    });
  });

  it('requires a reason', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send({ justification: validBody.justification });
    expect(res.status).toBe(400);
    expect(Grant.create).not.toHaveBeenCalled();
  });

  it('requires a meaningful justification', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send({ reason: 'OTHER', justification: 'need it' });
    expect(res.status).toBe(400);
  });

  it('caps access at 60 minutes', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send({ ...validBody, durationMinutes: 240 });
    expect(res.status).toBe(400);
  });

  it('is limited to clinicians', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(assistant))
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('is refused for patients already in the care team', async () => {
    (PatientModel.findById as jest.Mock).mockReturnValue(q(patientDoc(HOME_CLINIC)));
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown patient', async () => {
    (PatientModel.findById as jest.Mock).mockReturnValue(q(null));
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('grants 60-minute access, audits it and alerts compliance officers', async () => {
    const before = Date.now();
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      reason: 'LIFE_THREATENING_EMERGENCY',
      isActive: true,
      reviewStatus: 'PENDING',
      patientClinicId: OTHER_CLINIC,
    });
    const ttl = new Date(res.body.data.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 1_000);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMERGENCY_ACCESS_GRANTED',
        resourceId: PATIENT_ID,
        emergencyAccess: true,
        metadata: expect.objectContaining({ reason: 'LIFE_THREATENING_EMERGENCY' }),
      }),
      expect.anything()
    );
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'emergency_access', title: 'Emergency access granted' })
    );
    expect(emitToClinic).toHaveBeenCalledWith(
      OTHER_CLINIC,
      'emergency-access:granted',
      expect.objectContaining({ id: res.body.data.id })
    );
    expect(emitToClinic).toHaveBeenCalledWith(
      HOME_CLINIC,
      'emergency-access:granted',
      expect.anything()
    );
  });

  it('honours a shorter requested duration', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send({ ...validBody, durationMinutes: 15 });
    expect(res.status).toBe(201);
    const ttl = new Date(res.body.data.expiresAt).getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(15 * 60_000);
  });

  it('returns the existing grant instead of stacking a new one', async () => {
    const active = grant();
    Grant.findOne.mockReturnValue(q(active));
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(String(active._id));
    expect(Grant.create).not.toHaveBeenCalled();
  });

  it('still grants access when alerting fails', async () => {
    (UserModel.find as jest.Mock).mockImplementation(() => {
      throw new Error('db down');
    });
    const res = await request(app)
      .post(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor))
      .send(validBody);
    expect(res.status).toBe(201);
  });
});

// ── GET /patients/:id under emergency access ─────────────────────────────────

describe('GET /patients/:id outside the care team', () => {
  beforeEach(() => {
    (PatientModel.findById as jest.Mock).mockResolvedValue(patientDoc(OTHER_CLINIC));
  });

  it('is refused without an emergency access grant', async () => {
    const res = await request(app).get(`/api/v1/patients/${PATIENT_ID}`).set(as(doctor));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EmergencyAccessRequired');
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('is served under an active grant, tagged in the audit log and never cached', async () => {
    const active = grant();
    Grant.findOne.mockReturnValue(q(active));

    const res = await request(app).get(`/api/v1/patients/${PATIENT_ID}`).set(as(doctor));

    expect(res.status).toBe(200);
    expect(res.headers['x-emergency-access-expires']).toBe(active.expiresAt.toISOString());
    const [params, req] = (auditLog as jest.Mock).mock.calls[0];
    expect(params).toMatchObject({ action: 'PATIENT_VIEW', resourceId: PATIENT_ID });
    expect(req.emergencyAccess).toEqual({
      grantId: String(active._id),
      patientId: PATIENT_ID,
      expiresAt: active.expiresAt,
    });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('only looks up unexpired, un-ended grants — access expires automatically', async () => {
    await request(app).get(`/api/v1/patients/${PATIENT_ID}`).set(as(doctor));
    const filter = Grant.findOne.mock.calls[0][0];
    expect(filter).toMatchObject({
      userId: new Types.ObjectId(DOCTOR_ID),
      patientId: new Types.ObjectId(PATIENT_ID),
      endedAt: { $exists: false },
    });
    expect(filter.expiresAt.$gt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(filter.expiresAt.$gt.getTime()).toBeGreaterThan(Date.now() - 5_000);
  });

  it('still serves patients in the care team without a grant', async () => {
    (PatientModel.findById as jest.Mock).mockResolvedValue(patientDoc(HOME_CLINIC));
    const res = await request(app).get(`/api/v1/patients/${PATIENT_ID}`).set(as(doctor));
    expect(res.status).toBe(200);
    expect(Grant.findOne).not.toHaveBeenCalled();
  });
});

describe('isGrantActive', () => {
  it('expires on expiresAt and when ended early', () => {
    const now = new Date();
    expect(isGrantActive({ expiresAt: new Date(now.getTime() + 1_000) }, now)).toBe(true);
    expect(isGrantActive({ expiresAt: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(
      isGrantActive({ expiresAt: new Date(now.getTime() + 1_000), endedAt: new Date() }, now)
    ).toBe(false);
  });
});

// ── GET/DELETE /patients/:id/emergency-access ─────────────────────────────────

describe('active grant lookup and ending access early', () => {
  it('returns null when there is no active grant', async () => {
    const res = await request(app)
      .get(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor));
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('ends an active grant and audits it', async () => {
    const active = grant();
    Grant.findOne.mockReturnValue(q(active));
    Grant.findOneAndUpdate.mockReturnValue(q({ ...active, endedAt: new Date() }));

    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor));

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMERGENCY_ACCESS_ENDED', emergencyAccess: true }),
      expect.anything()
    );
  });

  it('returns 404 when nothing is active', async () => {
    const res = await request(app)
      .delete(`/api/v1/patients/${PATIENT_ID}/emergency-access`)
      .set(as(doctor));
    expect(res.status).toBe(404);
  });
});

// ── Compliance review queue ──────────────────────────────────────────────────

describe('compliance review queue', () => {
  it('is restricted to compliance officers', async () => {
    const res = await request(app).get('/api/v1/compliance/emergency-access').set(as(doctor));
    expect(res.status).toBe(403);
  });

  it('lists every emergency access touching the officer’s clinic', async () => {
    const items = [grant(), grant({ expiresAt: new Date(Date.now() - 1) })];
    Grant.find.mockReturnValue(q(items));
    Grant.countDocuments.mockResolvedValue(2);

    const res = await request(app)
      .get('/api/v1/compliance/emergency-access?status=PENDING')
      .set(as(patientAdmin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((g: { isActive: boolean }) => g.isActive)).toEqual([true, false]);
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 20 });
    const clinic = new Types.ObjectId(OTHER_CLINIC);
    expect(Grant.find).toHaveBeenCalledWith({
      $or: [{ patientClinicId: clinic }, { clinicId: clinic }],
      reviewStatus: 'PENDING',
    });
  });

  it('lets super admins see every clinic', async () => {
    Grant.find.mockReturnValue(q([]));
    Grant.countDocuments.mockResolvedValue(0);
    await request(app)
      .get('/api/v1/compliance/emergency-access')
      .set(as({ userId: ADMIN_ID, role: 'SUPER_ADMIN', clinicId: HOME_CLINIC }));
    expect(Grant.find).toHaveBeenCalledWith({});
  });

  it('records a review decision', async () => {
    const pending = grant();
    Grant.findOne.mockReturnValue(q(pending));
    Grant.findByIdAndUpdate.mockReturnValue(
      q({ ...pending, reviewStatus: 'FLAGGED', reviewNotes: 'No ED record', reviewedAt: new Date() })
    );

    const res = await request(app)
      .patch(`/api/v1/compliance/emergency-access/${pending._id}/review`)
      .set(as(patientAdmin))
      .send({ decision: 'FLAGGED', notes: 'No ED record' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ reviewStatus: 'FLAGGED', reviewNotes: 'No ED record' });
    expect(Grant.findByIdAndUpdate).toHaveBeenCalledWith(
      pending._id,
      {
        $set: expect.objectContaining({
          reviewStatus: 'FLAGGED',
          reviewedBy: new Types.ObjectId(ADMIN_ID),
        }),
      },
      { new: true }
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMERGENCY_ACCESS_REVIEWED' }),
      expect.anything()
    );
  });

  it('does not expose grants from unrelated clinics', async () => {
    const res = await request(app)
      .patch(`/api/v1/compliance/emergency-access/${new Types.ObjectId()}/review`)
      .set(as(unrelatedAdmin))
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(404);
  });

  it('forbids reviewing your own emergency access', async () => {
    Grant.findOne.mockReturnValue(q(grant({ userId: new Types.ObjectId(ADMIN_ID) })));
    const res = await request(app)
      .patch(`/api/v1/compliance/emergency-access/${new Types.ObjectId()}/review`)
      .set(as(patientAdmin))
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(403);
  });
});
