/**
 * Tests for user-management.controller.ts — invite, role change, deactivation,
 * RBAC denials, and tenant isolation.
 *
 * Issue: #1484
 * Target: ≥ 85% coverage, every RBAC rule has a negative test.
 */

process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.JWT_REFRESH_TOKEN_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
process.env.API_PORT = '3001';

// ── Module mocks ───────────────────────────────────────────────────────────────

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

jest.mock('@api/modules/auth/auth.controller', () => ({ authRoutes: require('express').Router() }));
jest.mock('@api/modules/patients/patients.controller', () => ({
  patientRoutes: require('express').Router(),
}));
jest.mock('@api/modules/encounters/encounters.controller', () => ({
  encounterRoutes: require('express').Router(),
}));
jest.mock('@api/modules/payments/payments.controller', () => ({
  paymentRoutes: require('express').Router(),
}));
jest.mock('@api/modules/ai/ai.routes', () => require('express').Router());
jest.mock('@api/modules/dashboard/dashboard.routes', () => require('express').Router());
jest.mock('@api/modules/appointments/appointments.controller', () => ({
  appointmentRoutes: require('express').Router(),
}));
jest.mock('@api/config/db', () => ({
  connectDB: jest.fn().mockReturnValue(new Promise(() => {})),
}));
jest.mock('@api/docs/swagger', () => ({ setupSwagger: jest.fn() }));
jest.mock('@api/modules/payments/services/payment-expiration-job', () => ({
  startPaymentExpirationJob: jest.fn(),
  stopPaymentExpirationJob: jest.fn(),
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));
jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: {
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
  },
}));
jest.mock('@api/utils/mailer', () => ({
  sendMail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/services/token-denylist.service', () => ({
  isDenylisted: jest.fn().mockResolvedValue(false),
  isInvalidatedForUser: jest.fn().mockResolvedValue(false),
}));
jest.mock('@api/modules/auth/totp.service', () => ({
  totpService: { setup: jest.fn(), verify: jest.fn() },
}));
jest.mock('@api/modules/clinics/clinic.model', () => ({
  ClinicModel: { findById: jest.fn() },
}));

// ── Imports ────────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '@api/app';
import { UserModel } from '../auth/models/user.model';
import { RefreshTokenModel } from '../auth/models/refresh-token.model';

// ── Helpers ────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz012345';
const CLINIC_ID = 'clinic-1';
const OTHER_CLINIC_ID = 'clinic-2';
const ADMIN_ID = '507f1f77bcf86cd799439011';
const TARGET_ID = '507f1f77bcf86cd799439012';

function makeToken(
  role: string,
  userId = ADMIN_ID,
  clinicId = CLINIC_ID
) {
  return jwt.sign(
    { userId, role, clinicId, jti: `jti-${Math.random()}` },
    JWT_SECRET,
    {
      expiresIn: '15m',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    }
  );
}

function makeUserDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TARGET_ID,
    fullName: 'Target User',
    email: 'target@clinic.com',
    role: 'DOCTOR',
    clinicId: { toString: () => CLINIC_ID },
    isActive: true,
    emailVerified: false,
    mfaEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    preferences: {},
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockFindById(doc: unknown) {
  (UserModel.findById as jest.Mock).mockResolvedValue(doc);
}

function mockFindByIdWithSelect(doc: unknown) {
  (UserModel.findById as jest.Mock).mockReturnValue({
    select: jest.fn().mockResolvedValue(doc),
  });
}

function mockFindOne(doc: unknown) {
  (UserModel.findOne as jest.Mock).mockResolvedValue(doc);
}

function mockFindList(docs: unknown[], total = docs.length) {
  (UserModel.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(docs),
  });
  (UserModel.countDocuments as jest.Mock).mockResolvedValue(total);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne(null); // no duplicate email by default
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users — Create / Invite
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users — invite (create)', () => {
  const validPayload = {
    fullName: 'New Doctor',
    email: 'newdoc@clinic.com',
    role: 'DOCTOR',
  };

  it('CLINIC_ADMIN can invite a DOCTOR into their own clinic (201)', async () => {
    (UserModel.create as jest.Mock).mockResolvedValue(
      makeUserDoc({ email: validPayload.email, _id: '507f1f77bcf86cd799439099' })
    );

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
  });

  it('SUPER_ADMIN can invite a CLINIC_ADMIN (201)', async () => {
    (UserModel.create as jest.Mock).mockResolvedValue(
      makeUserDoc({ role: 'CLINIC_ADMIN', _id: '507f1f77bcf86cd799439099' })
    );

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
      .send({ ...validPayload, role: 'CLINIC_ADMIN' });

    expect(res.status).toBe(201);
  });

  it('CLINIC_ADMIN cannot invite a SUPER_ADMIN — 403', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ ...validPayload, role: 'SUPER_ADMIN' });

    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN cannot invite a CLINIC_ADMIN — 403', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ ...validPayload, role: 'CLINIC_ADMIN' });

    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN cannot invite users into another clinic — 403', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`)
      .send({ ...validPayload, clinicId: OTHER_CLINIC_ID });

    expect(res.status).toBe(403);
  });

  it('returns 409 if email already exists', async () => {
    mockFindOne(makeUserDoc()); // simulate duplicate

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send(validPayload);

    expect(res.status).toBe(409);
  });

  it('sends a welcome email after successful creation', async () => {
    const { sendMail } = jest.requireMock('@api/utils/mailer');
    (UserModel.create as jest.Mock).mockResolvedValue(
      makeUserDoc({ email: validPayload.email, _id: '507f1f77bcf86cd799439099' })
    );

    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send(validPayload);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: validPayload.email })
    );
  });

  it('returns 403 for users without CLINIC_ADMIN or SUPER_ADMIN role', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`)
      .send(validPayload);

    expect(res.status).toBe(403);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/v1/users').send(validPayload);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/users — List
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/users — list', () => {
  it('CLINIC_ADMIN can list users in their own clinic (200)', async () => {
    mockFindList([makeUserDoc()]);

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('SUPER_ADMIN can list users (200)', async () => {
    mockFindList([makeUserDoc(), makeUserDoc({ _id: '507f1f77bcf86cd799439099' })]);

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns pagination metadata', async () => {
    mockFindList([makeUserDoc()], 25);

    const res = await request(app)
      .get('/api/v1/users?page=1&limit=10')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.body.meta).toMatchObject({ total: 25, page: 1, limit: 10 });
  });

  it('CLINIC_ADMIN list is automatically scoped to their clinicId', async () => {
    mockFindList([]);

    await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`);

    const [filter] = (UserModel.find as jest.Mock).mock.calls[0];
    expect(filter.clinicId).toBe(CLINIC_ID);
  });

  it('DOCTOR cannot list users — 403', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/v1/users/:id — Role change
// ─────────────────────────────────────────────────────────────────────────────

describe('PUT /api/v1/users/:id — role change', () => {
  it('CLINIC_ADMIN can change a DOCTOR to NURSE (200)', async () => {
    const user = makeUserDoc({ role: 'DOCTOR' });
    mockFindById(user);

    const res = await request(app)
      .put(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ role: 'NURSE', fullName: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(user.role).toBe('NURSE');
  });

  it('CLINIC_ADMIN cannot promote to CLINIC_ADMIN — 403', async () => {
    const user = makeUserDoc({ role: 'DOCTOR' });
    mockFindById(user);

    const res = await request(app)
      .put(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ role: 'CLINIC_ADMIN', fullName: 'Updated' });

    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN cannot modify a user in another clinic — 403', async () => {
    const user = makeUserDoc({ clinicId: { toString: () => OTHER_CLINIC_ID } });
    mockFindById(user);

    const res = await request(app)
      .put(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`)
      .send({ role: 'NURSE', fullName: 'Updated' });

    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN cannot modify a SUPER_ADMIN — 403', async () => {
    const user = makeUserDoc({ role: 'SUPER_ADMIN' });
    mockFindById(user);

    const res = await request(app)
      .put(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ role: 'DOCTOR', fullName: 'Updated' });

    expect(res.status).toBe(403);
  });

  it('SUPER_ADMIN can modify a SUPER_ADMIN account (200)', async () => {
    const user = makeUserDoc({ role: 'SUPER_ADMIN' });
    mockFindById(user);

    const res = await request(app)
      .put(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`)
      .send({ role: 'SUPER_ADMIN', fullName: 'Updated SA' });

    expect(res.status).toBe(200);
  });

  it('returns 404 when user does not exist', async () => {
    mockFindById(null);

    const res = await request(app)
      .put(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`)
      .send({ role: 'NURSE', fullName: 'Ghost' });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/v1/users/:id — Deactivation
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/v1/users/:id — deactivation', () => {
  it('CLINIC_ADMIN can deactivate a DOCTOR in their clinic (200)', async () => {
    const user = makeUserDoc({ role: 'DOCTOR', isActive: true });
    mockFindById(user);

    const res = await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(user.isActive).toBe(false);
  });

  it('cannot deactivate yourself — 400', async () => {
    // userId in the token matches the target id
    const res = await request(app)
      .delete(`/api/v1/users/${ADMIN_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID)}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('cannot deactivate your own account');
  });

  it('CLINIC_ADMIN cannot deactivate a SUPER_ADMIN — 403', async () => {
    const user = makeUserDoc({ role: 'SUPER_ADMIN' });
    mockFindById(user);

    const res = await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN cannot deactivate another CLINIC_ADMIN — 403', async () => {
    const user = makeUserDoc({ role: 'CLINIC_ADMIN' });
    mockFindById(user);

    const res = await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(403);
  });

  it('CLINIC_ADMIN cannot deactivate a user from another clinic — 403', async () => {
    const user = makeUserDoc({ role: 'DOCTOR', clinicId: { toString: () => OTHER_CLINIC_ID } });
    mockFindById(user);

    const res = await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`);

    expect(res.status).toBe(403);
  });

  it('invalidates all refresh tokens after deactivation', async () => {
    const user = makeUserDoc({ role: 'DOCTOR' });
    mockFindById(user);

    await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId: TARGET_ID });
  });

  it('returns 404 when user does not exist', async () => {
    mockFindById(null);

    const res = await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(404);
  });

  it('DOCTOR cannot deactivate users — 403', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('DOCTOR')}`);

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tenant isolation — GET /api/v1/users/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('tenant isolation — GET /api/v1/users/:id', () => {
  it('CLINIC_ADMIN cannot view a user in another clinic — 403', async () => {
    const user = makeUserDoc({ clinicId: { toString: () => OTHER_CLINIC_ID } });
    mockFindByIdWithSelect(user);

    const res = await request(app)
      .get(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('your clinic');
  });

  it('SUPER_ADMIN can view a user in any clinic (200)', async () => {
    const user = makeUserDoc({ clinicId: { toString: () => OTHER_CLINIC_ID } });
    mockFindByIdWithSelect(user);

    const res = await request(app)
      .get(`/api/v1/users/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken('SUPER_ADMIN')}`);

    expect(res.status).toBe(200);
  });

  it('list endpoint scopes CLINIC_ADMIN to their clinicId only', async () => {
    mockFindList([]);

    await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`);

    const [filter] = (UserModel.find as jest.Mock).mock.calls[0];
    expect(filter.clinicId).toBe(CLINIC_ID);
    expect(filter.clinicId).not.toBe(OTHER_CLINIC_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users/:id/revoke-sessions
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/:id/revoke-sessions', () => {
  it('revokes all refresh tokens and returns count (200)', async () => {
    const user = makeUserDoc();
    mockFindById(user);
    (RefreshTokenModel.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 5 });

    const res = await request(app)
      .post(`/api/v1/users/${TARGET_ID}/revoke-sessions`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(5);
  });

  it('CLINIC_ADMIN cannot revoke sessions for a user in another clinic — 403', async () => {
    const user = makeUserDoc({ clinicId: { toString: () => OTHER_CLINIC_ID } });
    mockFindById(user);

    const res = await request(app)
      .post(`/api/v1/users/${TARGET_ID}/revoke-sessions`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 when user does not exist', async () => {
    mockFindById(null);

    const res = await request(app)
      .post(`/api/v1/users/${TARGET_ID}/revoke-sessions`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/users/:id/reactivate
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/v1/users/:id/reactivate', () => {
  it('CLINIC_ADMIN can reactivate a deactivated user in their clinic (200)', async () => {
    const user = makeUserDoc({ isActive: false, role: 'DOCTOR' });
    mockFindById(user);

    const res = await request(app)
      .post(`/api/v1/users/${TARGET_ID}/reactivate`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(200);
    expect(user.isActive).toBe(true);
  });

  it('CLINIC_ADMIN cannot reactivate a user from another clinic — 403', async () => {
    const user = makeUserDoc({ isActive: false, clinicId: { toString: () => OTHER_CLINIC_ID } });
    mockFindById(user);

    const res = await request(app)
      .post(`/api/v1/users/${TARGET_ID}/reactivate`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN', ADMIN_ID, CLINIC_ID)}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 when user does not exist', async () => {
    mockFindById(null);

    const res = await request(app)
      .post(`/api/v1/users/${TARGET_ID}/reactivate`)
      .set('Authorization', `Bearer ${makeToken('CLINIC_ADMIN')}`);

    expect(res.status).toBe(404);
  });
});
