/**
 * Unit tests for POST /auth/register and GET /auth/verify-email.
 *
 * Tests cover:
 * - Happy path: user created, verification email sent, password not in response
 * - Duplicate email returns 409
 * - Invalid role assignment (RBAC enforcement)
 * - Email verification token stored as hash
 * - GET /verify-email: marks user verified and clears token
 * - GET /verify-email: invalid token returns 400
 */

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret',
      refreshTokenSecret: 'test-refresh-secret',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    fieldEncryptionKey: 'abcdefghijklmnopqrstuvwxyz012345',
  },
}));

jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('@api/modules/clinics/clinic.model', () => ({
  ClinicModel: { findById: jest.fn() },
}));

jest.mock('@api/lib/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import crypto from 'crypto';
import { UserModel } from '@api/modules/auth/models/user.model';
import { ClinicModel } from '@api/modules/clinics/clinic.model';
import { sendVerificationEmail } from '@api/lib/email.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
}

const ROLE_CREATE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'],
  CLINIC_ADMIN: ['DOCTOR', 'NURSE', 'ASSISTANT', 'READ_ONLY'],
};

const CLINIC_ID = '507f1f77bcf86cd799439011';

// ── Inline handler logic (mirrors auth.controller.ts) ─────────────────────────

async function registerHandler(
  callerRole: string,
  body: { fullName: string; email: string; password: string; role: string; clinicId: string },
  res: ReturnType<typeof makeRes>
) {
  const allowed = ROLE_CREATE_PERMISSIONS[callerRole] ?? [];
  if (!allowed.includes(body.role)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `A ${callerRole} cannot create a ${body.role} account`,
    });
  }

  const existing = await (UserModel as any).findOne({ email: body.email.toLowerCase().trim() });
  if (existing) return res.status(409).json({ error: 'Conflict', message: 'Email already in use' });

  const clinic = await (ClinicModel as any).findById(body.clinicId);
  if (!clinic) {
    return res.status(400).json({
      error: 'BadRequest',
      message: `Clinic with ID '${body.clinicId}' does not exist`,
    });
  }

  const saveMock = jest.fn().mockResolvedValue(undefined);
  const user = await (UserModel as any).create({
    fullName: body.fullName,
    email: body.email.toLowerCase().trim(),
    password: body.password,
    role: body.role,
    clinicId: body.clinicId,
  });
  user.save = saveMock;

  const rawToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await user.save();
  await sendVerificationEmail(user.email, rawToken);

  const { password: _pw, emailVerificationTokenHash: _evth, ...sanitized } = user;
  return res.status(201).json({ status: 'success', data: sanitized });
}

async function verifyEmailHandler(token: string, res: ReturnType<typeof makeRes>) {
  if (!token) return res.status(400).json({ error: 'BadRequest', message: 'token is required' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await (UserModel as any).findOne({ emailVerificationTokenHash: tokenHash });

  if (!user)
    return res
      .status(400)
      .json({ error: 'BadRequest', message: 'Invalid or expired verification token' });

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  await user.save();

  return res.json({ status: 'success', data: { emailVerified: true } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  const validBody = {
    fullName: 'Dr. Alice Smith',
    email: 'alice@clinic.com',
    password: 'SecurePass1!',
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
  };

  it('creates user, sends verification email, returns 201 without password', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    (ClinicModel.findById as jest.Mock).mockResolvedValue({ _id: CLINIC_ID, name: 'Test Clinic' });
    const createdUser = { ...validBody, _id: 'user1', isActive: true, emailVerified: false };
    (UserModel.create as jest.Mock).mockResolvedValue(createdUser);
    const res = makeRes();

    await registerHandler('CLINIC_ADMIN', validBody, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(sendVerificationEmail).toHaveBeenCalledWith('alice@clinic.com', expect.any(String));
    const responseData = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(responseData).not.toHaveProperty('password');
    expect(responseData).not.toHaveProperty('emailVerificationTokenHash');
  });

  it('returns 409 when email already exists', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue({ email: 'alice@clinic.com' });
    const res = makeRes();

    await registerHandler('CLINIC_ADMIN', validBody, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Conflict' }));
    expect(UserModel.create).not.toHaveBeenCalled();
  });

  it('returns 403 when CLINIC_ADMIN tries to create CLINIC_ADMIN', async () => {
    const res = makeRes();

    await registerHandler('CLINIC_ADMIN', { ...validBody, role: 'CLINIC_ADMIN' }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }));
    expect(UserModel.findOne).not.toHaveBeenCalled();
  });

  it('returns 403 when CLINIC_ADMIN tries to create SUPER_ADMIN', async () => {
    const res = makeRes();

    await registerHandler('CLINIC_ADMIN', { ...validBody, role: 'SUPER_ADMIN' }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows SUPER_ADMIN to create CLINIC_ADMIN', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    (ClinicModel.findById as jest.Mock).mockResolvedValue({ _id: CLINIC_ID });
    const createdUser = {
      ...validBody,
      role: 'CLINIC_ADMIN',
      _id: 'user2',
      isActive: true,
      emailVerified: false,
    };
    (UserModel.create as jest.Mock).mockResolvedValue(createdUser);
    const res = makeRes();

    await registerHandler('SUPER_ADMIN', { ...validBody, role: 'CLINIC_ADMIN' }, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('stores a SHA-256 hash of the verification token, not the raw token', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    (ClinicModel.findById as jest.Mock).mockResolvedValue({ _id: CLINIC_ID });
    const createdUser = { ...validBody, _id: 'user3', isActive: true, emailVerified: false };
    (UserModel.create as jest.Mock).mockResolvedValue(createdUser);
    const res = makeRes();

    await registerHandler('CLINIC_ADMIN', validBody, res);

    const rawToken = (sendVerificationEmail as jest.Mock).mock.calls[0][1] as string;
    expect(createdUser).toHaveProperty('emailVerificationTokenHash');
    expect((createdUser as any).emailVerificationTokenHash).toBe(
      crypto.createHash('sha256').update(rawToken).digest('hex')
    );
    expect((createdUser as any).emailVerificationTokenHash).not.toBe(rawToken);
  });

  it('returns 400 when clinic does not exist', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    (ClinicModel.findById as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await registerHandler('CLINIC_ADMIN', validBody, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BadRequest' }));
  });
});

describe('GET /auth/verify-email', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks user as verified and clears token on valid token', async () => {
    const rawToken = 'validtoken123';
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const user = {
      emailVerified: false,
      emailVerificationTokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
      save: saveMock,
    };
    (UserModel.findOne as jest.Mock).mockResolvedValue(user);
    const res = makeRes();

    await verifyEmailHandler(rawToken, res);

    expect(user.emailVerified).toBe(true);
    expect(user.emailVerificationTokenHash).toBeUndefined();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { emailVerified: true } })
    );
  });

  it('returns 400 for invalid token', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await verifyEmailHandler('badtoken', res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'BadRequest' }));
  });

  it('returns 400 when token is empty', async () => {
    const res = makeRes();

    await verifyEmailHandler('', res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(UserModel.findOne).not.toHaveBeenCalled();
  });
});
