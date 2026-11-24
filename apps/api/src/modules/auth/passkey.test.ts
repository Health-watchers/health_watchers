/**
 * Tests for staff WebAuthn passkeys (Issue #1496).
 *
 * The WebAuthn ceremony itself is delegated to @simplewebauthn/server and covered by
 * passkey.service.test.ts; here the service is mocked so the routes' policy logic
 * (MFA satisfaction for DOCTOR, backup codes, ownership, limits) is exercised.
 */
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';

jest.mock('@health-watchers/config', () => ({
  config: {
    jwt: {
      accessTokenSecret: 'test-access-secret-32-chars-long!!',
      refreshTokenSecret: 'test-refresh-secret-32-chars-long!',
      tempTokenSecret: 'test-temp-secret-32-characters-long!',
      issuer: 'health-watchers-api',
      audience: 'health-watchers-client',
    },
    nodeEnv: 'test',
    fieldEncryptionKey: 'a'.repeat(64),
  },
}));
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@api/lib/email.service', () => {
  const handler = {
    get: (_target: unknown, prop: string | symbol) =>
      typeof prop === 'string' ? jest.fn() : undefined,
  };
  return new Proxy({}, handler);
});
jest.mock('@api/middlewares/auth.middleware', () => ({
  authenticate: (req: any, res: any, next: () => void) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ error: 'Unauthorized' });
    req.user = JSON.parse(raw);
    next();
  },
}));
jest.mock('@api/services/token-denylist.service', () => ({
  addToDenylist: jest.fn(),
  setUserInvalidatedAt: jest.fn(),
}));
jest.mock('@api/modules/audit/audit.service', () => ({ auditLog: jest.fn() }));
jest.mock('@api/modules/auth/totp.service', () => ({
  totpService: { setup: jest.fn(), verify: jest.fn() },
}));
jest.mock('@api/modules/auth/models/user.model', () => ({
  UserModel: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: { create: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() },
}));
jest.mock('@api/modules/auth/models/passkey.model', () => ({
  PasskeyModel: {
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOneAndDelete: jest.fn(),
  },
}));
jest.mock('@api/modules/auth/services/passkey.service', () => ({
  MAX_PASSKEYS_PER_USER: 10,
  createRegistrationOptions: jest.fn(),
  verifyRegistration: jest.fn(),
  createAuthenticationOptions: jest.fn(),
  verifyAuthentication: jest.fn(),
}));

import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { authRoutes } from './auth.controller';
import { UserModel } from './models/user.model';
import { PasskeyModel } from './models/passkey.model';
import { RefreshTokenModel } from './models/refresh-token.model';
import { signTempToken } from './token.service';
import * as passkeyService from './services/passkey.service';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

const USER_ID = '507f1f77bcf86cd799439022';
const CLINIC_ID = '507f1f77bcf86cd799439011';
const PASSKEY_ID = '507f1f77bcf86cd799439033';
const CHALLENGE_ID = '3f8c2a52-1d1f-4c55-9d3a-0d1a3c1b2e4f';

const asUser = (role = 'DOCTOR') => JSON.stringify({ userId: USER_ID, role, clinicId: CLINIC_ID });

const credential = {
  id: 'cred-id',
  rawId: 'cred-id',
  type: 'public-key',
  response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' },
};

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    _id: USER_ID,
    email: 'doctor@clinic.com',
    fullName: 'Dr. Grey',
    password: '$2a$12$hashed',
    role: 'DOCTOR',
    clinicId: CLINIC_ID,
    isActive: true,
    mfaEnabled: false,
    passkeyCount: 0,
    failedLoginAttempts: 0,
    mfaGracePeriodEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    mfaBackupCodes: undefined as string[] | undefined,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** UserModel.findById(...) is awaited directly and via .select() */
function mockFindById(user: unknown) {
  const query = Promise.resolve(user) as Promise<unknown> & { select: jest.Mock };
  query.select = jest.fn().mockResolvedValue(user);
  (UserModel.findById as jest.Mock).mockReturnValue(query);
}

beforeEach(() => {
  jest.clearAllMocks();
  (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
});

describe('password login with passkeys', () => {
  beforeEach(() => {
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  it('lets a DOCTOR satisfy MFA with a passkey instead of hitting the TOTP grace period', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(makeUser({ passkeyCount: 1 }));

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('mfa_required');
    expect(res.body.data.methods).toEqual(['passkey', 'backup_code']);
    expect(res.body.data.tempToken).toEqual(expect.any(String));
    expect(res.body.data.accessToken).toBeUndefined();
  });

  it('offers both TOTP and passkey when a DOCTOR has both', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(
      makeUser({ passkeyCount: 2, mfaEnabled: true })
    );

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@clinic.com', password: 'ValidPass1!' });

    expect(res.body.data.methods).toEqual(['totp', 'passkey', 'backup_code']);
  });

  it('does not treat a passkey as MFA for roles outside PASSKEY_MFA_ROLES', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(
      makeUser({ role: 'NURSE', passkeyCount: 1 })
    );

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nurse@clinic.com', password: 'ValidPass1!' });

    expect(res.body.status).toBe('success');
    expect(res.body.data.warning).toBe('mfa_required');
  });
});

describe('POST /auth/passkeys/register/*', () => {
  it('returns registration options with a challenge id', async () => {
    mockFindById(makeUser());
    (passkeyService.createRegistrationOptions as jest.Mock).mockResolvedValue({
      challengeId: CHALLENGE_ID,
      options: { challenge: 'abc' },
    });

    const res = await request(app)
      .post('/api/v1/auth/passkeys/register/options')
      .set('x-test-user', asUser());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ challengeId: CHALLENGE_ID, options: { challenge: 'abc' } });
  });

  it('refuses to register beyond the per-user limit', async () => {
    mockFindById(makeUser({ passkeyCount: 10 }));

    const res = await request(app)
      .post('/api/v1/auth/passkeys/register/options')
      .set('x-test-user', asUser());

    expect(res.status).toBe(409);
    expect(passkeyService.createRegistrationOptions).not.toHaveBeenCalled();
  });

  it('stores the passkey, updates the count and issues first-time backup codes', async () => {
    const user = makeUser();
    mockFindById(user);
    (passkeyService.verifyRegistration as jest.Mock).mockResolvedValue({
      _id: PASSKEY_ID,
      name: 'Clinic laptop',
      deviceType: 'singleDevice',
      backedUp: false,
      createdAt: new Date(),
    });
    (PasskeyModel.countDocuments as jest.Mock).mockResolvedValue(1);

    const res = await request(app)
      .post('/api/v1/auth/passkeys/register/verify')
      .set('x-test-user', asUser())
      .send({ challengeId: CHALLENGE_ID, response: credential, name: 'Clinic laptop' });

    expect(res.status).toBe(201);
    expect(res.body.data.passkey).toMatchObject({ id: PASSKEY_ID, name: 'Clinic laptop' });
    expect(res.body.data.backupCodes).toHaveLength(10);
    expect(user.passkeyCount).toBe(1);
    expect(user.mfaBackupCodes).toHaveLength(10);
    expect(user.save).toHaveBeenCalled();
  });

  it('keeps existing backup codes when registering another passkey', async () => {
    const user = makeUser({ passkeyCount: 1, mfaBackupCodes: ['h1', 'h2'] });
    mockFindById(user);
    (passkeyService.verifyRegistration as jest.Mock).mockResolvedValue({
      _id: PASSKEY_ID,
      name: 'Security key',
      deviceType: 'singleDevice',
      backedUp: false,
    });
    (PasskeyModel.countDocuments as jest.Mock).mockResolvedValue(2);

    const res = await request(app)
      .post('/api/v1/auth/passkeys/register/verify')
      .set('x-test-user', asUser())
      .send({ challengeId: CHALLENGE_ID, response: credential });

    expect(res.status).toBe(201);
    expect(res.body.data.backupCodes).toBeUndefined();
    expect(user.mfaBackupCodes).toEqual(['h1', 'h2']);
  });

  it('rejects a registration that fails verification', async () => {
    mockFindById(makeUser());
    (passkeyService.verifyRegistration as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/passkeys/register/verify')
      .set('x-test-user', asUser())
      .send({ challengeId: CHALLENGE_ID, response: credential });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('InvalidPasskey');
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/auth/passkeys/register/options');
    expect(res.status).toBe(401);
  });
});

describe('passkey management', () => {
  it('lists only the caller passkeys without key material', async () => {
    (PasskeyModel.find as jest.Mock).mockReturnValue({
      sort: () => ({
        lean: () =>
          Promise.resolve([
            {
              _id: PASSKEY_ID,
              name: 'Laptop',
              deviceType: 'multiDevice',
              backedUp: true,
              publicKey: 'secret-ish',
              credentialId: 'cred',
            },
          ]),
      }),
    });

    const res = await request(app).get('/api/v1/auth/passkeys').set('x-test-user', asUser());

    expect(res.status).toBe(200);
    expect(PasskeyModel.find).toHaveBeenCalledWith({ userId: USER_ID });
    expect(res.body.data[0]).toEqual({
      id: PASSKEY_ID,
      name: 'Laptop',
      deviceType: 'multiDevice',
      backedUp: true,
      lastUsedAt: null,
    });
  });

  it('renames a passkey scoped to the caller', async () => {
    (PasskeyModel.findOneAndUpdate as jest.Mock).mockReturnValue({
      lean: () =>
        Promise.resolve({ _id: PASSKEY_ID, name: 'Front desk', deviceType: 'x', backedUp: false }),
    });

    const res = await request(app)
      .patch(`/api/v1/auth/passkeys/${PASSKEY_ID}`)
      .set('x-test-user', asUser())
      .send({ name: 'Front desk' });

    expect(res.status).toBe(200);
    expect(PasskeyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: PASSKEY_ID, userId: USER_ID },
      { name: 'Front desk' },
      expect.any(Object)
    );
    expect(res.body.data.name).toBe('Front desk');
  });

  it('removes a passkey and updates the count', async () => {
    const user = makeUser({ passkeyCount: 1 });
    mockFindById(user);
    (PasskeyModel.findOneAndDelete as jest.Mock).mockResolvedValue({ _id: PASSKEY_ID });
    (PasskeyModel.countDocuments as jest.Mock).mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/auth/passkeys/${PASSKEY_ID}`)
      .set('x-test-user', asUser());

    expect(res.status).toBe(200);
    expect(PasskeyModel.findOneAndDelete).toHaveBeenCalledWith({
      _id: PASSKEY_ID,
      userId: USER_ID,
    });
    expect(user.passkeyCount).toBe(0);
  });

  it('rejects an invalid passkey id', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/passkeys/not-an-id')
      .set('x-test-user', asUser());
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/passkeys/login/*', () => {
  it('issues usernameless options when no temp token is given', async () => {
    (passkeyService.createAuthenticationOptions as jest.Mock).mockResolvedValue({
      challengeId: CHALLENGE_ID,
      options: { challenge: 'abc' },
    });

    const res = await request(app).post('/api/v1/auth/passkeys/login/options').send({});

    expect(res.status).toBe(200);
    expect(passkeyService.createAuthenticationOptions).toHaveBeenCalledWith(undefined);
  });

  it('scopes options to the user identified by the temp token', async () => {
    (passkeyService.createAuthenticationOptions as jest.Mock).mockResolvedValue({
      challengeId: CHALLENGE_ID,
      options: {},
    });

    await request(app)
      .post('/api/v1/auth/passkeys/login/options')
      .send({ tempToken: signTempToken(USER_ID) });

    expect(passkeyService.createAuthenticationOptions).toHaveBeenCalledWith(USER_ID);
  });

  it('rejects an invalid temp token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/passkeys/login/options')
      .send({ tempToken: 'nope' });
    expect(res.status).toBe(401);
  });

  it('signs a DOCTOR in with a verified passkey', async () => {
    (passkeyService.verifyAuthentication as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      passkeyId: PASSKEY_ID,
    });
    mockFindById(makeUser({ passkeyCount: 1 }));

    const res = await request(app)
      .post('/api/v1/auth/passkeys/login/verify')
      .send({ challengeId: CHALLENGE_ID, response: credential });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(RefreshTokenModel.create).toHaveBeenCalled();
  });

  it('completes a password + passkey MFA challenge', async () => {
    (passkeyService.verifyAuthentication as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      passkeyId: PASSKEY_ID,
    });
    mockFindById(makeUser({ passkeyCount: 1 }));

    const res = await request(app)
      .post('/api/v1/auth/passkeys/login/verify')
      .send({ challengeId: CHALLENGE_ID, response: credential, tempToken: signTempToken(USER_ID) });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("rejects a passkey that belongs to someone other than the temp token's user", async () => {
    (passkeyService.verifyAuthentication as jest.Mock).mockResolvedValue({
      userId: '507f1f77bcf86cd799439099',
      passkeyId: PASSKEY_ID,
    });

    const res = await request(app)
      .post('/api/v1/auth/passkeys/login/verify')
      .send({ challengeId: CHALLENGE_ID, response: credential, tempToken: signTempToken(USER_ID) });

    expect(res.status).toBe(401);
    expect(RefreshTokenModel.create).not.toHaveBeenCalled();
  });

  it('still requires TOTP after a passkey sign-in for MFA roles outside PASSKEY_MFA_ROLES', async () => {
    (passkeyService.verifyAuthentication as jest.Mock).mockResolvedValue({
      userId: USER_ID,
      passkeyId: PASSKEY_ID,
    });
    mockFindById(makeUser({ role: 'CLINIC_ADMIN', mfaEnabled: true, passkeyCount: 1 }));

    const res = await request(app)
      .post('/api/v1/auth/passkeys/login/verify')
      .send({ challengeId: CHALLENGE_ID, response: credential });

    expect(res.body.status).toBe('mfa_required');
    expect(res.body.data.methods).toEqual(['totp', 'backup_code']);
    expect(RefreshTokenModel.create).not.toHaveBeenCalled();
  });

  it('rejects an assertion that fails verification', async () => {
    (passkeyService.verifyAuthentication as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/passkeys/login/verify')
      .send({ challengeId: CHALLENGE_ID, response: credential });

    expect(res.status).toBe(401);
  });

  it('accepts a backup code as recovery for a passkey-only DOCTOR', async () => {
    const { hashToken } = jest.requireActual('./mfa-policy');
    const user = makeUser({ passkeyCount: 1, mfaBackupCodes: [hashToken('abcde12345')] });
    mockFindById(user);

    const res = await request(app)
      .post('/api/v1/auth/mfa/backup')
      .send({ tempToken: signTempToken(USER_ID), backupCode: 'abcde12345' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(user.mfaBackupCodes).toHaveLength(0);
  });
});
