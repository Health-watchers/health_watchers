/**
 * Unit tests for refresh token rotation, logout, and logout-all.
 *
 * Tests cover:
 * - Normal rotation: old JTI consumed, new JTI issued
 * - Replay attack detection: consumed JTI revokes entire family
 * - Invalid/missing JTI returns 401
 * - POST /auth/logout: deletes the provided token's JTI
 * - POST /auth/logout-all: deletes all tokens for the user
 * - signRefreshToken includes unique JTI and family claims
 * - Replay attack: consumed JTI revokes entire family
 * - Logout: deletes the specific JTI
 * - Logout-all: deletes all tokens for the user
 * - Invalid/missing token handling
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
  UserModel: { findById: jest.fn() },
}));

jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: {
    findOne: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import jwt from 'jsonwebtoken';
import { UserModel } from '@api/modules/auth/models/user.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';
import {
  signRefreshToken,
  verifyRefreshToken,
  signAccessToken,
  REFRESH_TOKEN_EXPIRY_MS,
  TokenPayload,
} from './token.service';
import { UserModel } from '@api/modules/auth/models/user.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';
} from './token.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
}

const mockPayload: TokenPayload = {
  userId: 'user123',
  role: 'DOCTOR',
  clinicId: 'clinic456',
};

// ── Inline handler logic (mirrors auth.controller.ts) ─────────────────────────

async function refreshHandler(
  refreshToken: string,
  res: ReturnType<typeof makeRes>,
) {
  const decoded = verifyRefreshToken(refreshToken);
const USER_ID = '507f1f77bcf86cd799439011';
const CLINIC_ID = '507f1f77bcf86cd799439022';
const mockUser = { id: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID, isActive: true };

// ── Inline handler logic (mirrors auth.controller.ts) ─────────────────────────

async function refreshHandler(body: { refreshToken: string }, res: ReturnType<typeof makeRes>) {
  const decoded = verifyRefreshToken(body.refreshToken);
  if (!decoded)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });

  const existing = await (RefreshTokenModel as any).findOne({ jti: decoded.jti });
  if (!existing)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });

  if (existing.consumed) {
    await (RefreshTokenModel as any).deleteMany({ family: existing.family });
    return res
      .status(401)
      .json({ error: 'Unauthorized', message: 'Token reuse detected — all sessions revoked' });
  }

  const user = await (UserModel as any).findById(decoded.userId);
  if (!user || !user.isActive)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });

  existing.consumed = true;
  await existing.save();

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
  const { token: newRefreshToken, jti, family } = signRefreshToken(p, decoded.family);
  const { token: refreshToken, jti, family } = signRefreshToken(p, decoded.family);
  await (RefreshTokenModel as any).create({
    jti,
    userId: user.id,
    family,
    consumed: false,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
  });

  return res.json({
    status: 'success',
    data: { accessToken: signAccessToken(p), refreshToken: newRefreshToken },
  });
}

async function logoutHandler(refreshToken: string, res: ReturnType<typeof makeRes>) {
  const decoded = verifyRefreshToken(refreshToken);
    data: { accessToken: signAccessToken(p), refreshToken },
  });
}

async function logoutHandler(body: { refreshToken: string }, res: ReturnType<typeof makeRes>) {
  const decoded = verifyRefreshToken(body.refreshToken);
  if (decoded) {
    await (RefreshTokenModel as any).deleteOne({ jti: decoded.jti });
  }
  return res.json({ status: 'success', data: { loggedOut: true } });
}

async function logoutAllHandler(userId: string, res: ReturnType<typeof makeRes>) {
  await (RefreshTokenModel as any).deleteMany({ userId });
  return res.json({ status: 'success', data: { loggedOut: true } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('signRefreshToken', () => {
  it('includes unique JTI claim in each token', () => {
    const { token: t1, jti: jti1 } = signRefreshToken(mockPayload);
    const { token: t2, jti: jti2 } = signRefreshToken(mockPayload);

    expect(jti1).toBeDefined();
    expect(jti2).toBeDefined();
    expect(jti1).not.toBe(jti2);

    const decoded1 = jwt.decode(t1) as any;
    const decoded2 = jwt.decode(t2) as any;
    expect(decoded1.jti).toBe(jti1);
    expect(decoded2.jti).toBe(jti2);
  });

  it('preserves family when provided', () => {
    const { family: f1 } = signRefreshToken(mockPayload);
    const { token, family: f2 } = signRefreshToken(mockPayload, f1);

    expect(f2).toBe(f1);
    const decoded = jwt.decode(token) as any;
    expect(decoded.family).toBe(f1);
  });

  it('generates new family when not provided', () => {
    const { family: f1 } = signRefreshToken(mockPayload);
    const { family: f2 } = signRefreshToken(mockPayload);
    expect(f1).not.toBe(f2);
  });
});

describe('POST /auth/refresh — token rotation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rotates token: marks old JTI consumed and issues new one', async () => {
    const { token, jti, family } = signRefreshToken(mockPayload);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const existing = { jti, family, consumed: false, save: saveMock };
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue(existing);
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'user123', role: 'DOCTOR', clinicId: 'clinic456', isActive: true,
    });
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler(token, res);
describe('Refresh token rotation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues new access + refresh tokens and marks old JTI consumed', async () => {
    const { token, jti, family } = signRefreshToken({
      userId: USER_ID,
      role: 'DOCTOR',
      clinicId: CLINIC_ID,
    });
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const existing = { jti, family, consumed: false, save: saveMock };

    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue(existing);
    (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    expect(existing.consumed).toBe(true);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(RefreshTokenModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ family, consumed: false })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' }),
    );
    const responseData = (res.json as jest.Mock).mock.calls[0][0].data;
    expect(responseData).toHaveProperty('accessToken');
    expect(responseData).toHaveProperty('refreshToken');
  });

  it('new refresh token preserves the same family', async () => {
    const { token, jti, family } = signRefreshToken(mockPayload);
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: false, save: saveMock });
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'user123', role: 'DOCTOR', clinicId: 'clinic456', isActive: true,
    });
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler(token, res);

    const createArg = (RefreshTokenModel.create as jest.Mock).mock.calls[0][0];
    expect(createArg.family).toBe(family);
    expect(createArg.jti).not.toBe(jti); // new JTI
  });

  it('detects replay attack: revokes entire family when consumed JTI is presented', async () => {
    const { token, jti, family } = signRefreshToken(mockPayload);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: true });
    const res = makeRes();

    await refreshHandler(token, res);

    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ family });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Token reuse detected — all sessions revoked' }),
    );
  });

  it('returns 401 when JTI not found in DB', async () => {
    const { token } = signRefreshToken(mockPayload);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await refreshHandler(token, res);
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        }),
      })
    );
  });

  it('new refresh token has a different JTI than the old one', async () => {
    const { token, jti, family } = signRefreshToken({
      userId: USER_ID,
      role: 'DOCTOR',
      clinicId: CLINIC_ID,
    });
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({
      jti,
      family,
      consumed: false,
      save: saveMock,
    });
    (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    const newJti = (RefreshTokenModel.create as jest.Mock).mock.calls[0][0].jti;
    expect(newJti).not.toBe(jti);
  });

  it('preserves the token family across rotation', async () => {
    const { token, jti, family } = signRefreshToken({
      userId: USER_ID,
      role: 'DOCTOR',
      clinicId: CLINIC_ID,
    });
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({
      jti,
      family,
      consumed: false,
      save: saveMock,
    });
    (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    const createdFamily = (RefreshTokenModel.create as jest.Mock).mock.calls[0][0].family;
    expect(createdFamily).toBe(family);
  });

  it('detects replay attack: revokes entire family when consumed JTI is presented', async () => {
    const { token, jti, family } = signRefreshToken({
      userId: USER_ID,
      role: 'DOCTOR',
      clinicId: CLINIC_ID,
    });
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: true });
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ family });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });

  it('returns 401 when JTI not found in DB (already deleted/expired)', async () => {
    const { token } = signRefreshToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue(null);
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for invalid/malformed refresh token', async () => {
    const res = makeRes();

    await refreshHandler('not.a.valid.token', res);

  it('returns 401 for invalid JWT signature', async () => {
    const res = makeRes();
    await refreshHandler({ refreshToken: 'invalid.token.here' }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(RefreshTokenModel.findOne).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the token JTI from DB', async () => {
    const { token, jti } = signRefreshToken(mockPayload);
    (RefreshTokenModel.deleteOne as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await logoutHandler(token, res);
  it('deletes the JTI from DB and returns loggedOut: true', async () => {
    const { token, jti } = signRefreshToken({
      userId: USER_ID,
      role: 'DOCTOR',
      clinicId: CLINIC_ID,
    });
    (RefreshTokenModel.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    const res = makeRes();

    await logoutHandler({ refreshToken: token }, res);

    expect(RefreshTokenModel.deleteOne).toHaveBeenCalledWith({ jti });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });

  it('returns success even for invalid token (graceful logout)', async () => {
    const res = makeRes();

    await logoutHandler('invalid.token', res);

  it('returns 200 even for an invalid token (graceful logout)', async () => {
    const res = makeRes();
    await logoutHandler({ refreshToken: 'bad.token' }, res);
    expect(RefreshTokenModel.deleteOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });
});

describe('POST /auth/logout-all', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes all tokens for the user', async () => {
    (RefreshTokenModel.deleteMany as jest.Mock).mockResolvedValue({ deletedCount: 3 });
    const res = makeRes();

    await logoutAllHandler('user123', res);

    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId: 'user123' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });
});

describe('REFRESH_TOKEN_EXPIRY_MS', () => {
  it('equals 7 days in milliseconds', () => {
    expect(REFRESH_TOKEN_EXPIRY_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
    await logoutAllHandler(USER_ID, res);

    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });
});
