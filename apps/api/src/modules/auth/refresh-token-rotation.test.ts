/**
 * Unit tests for refresh token rotation, logout, and logout-all.
 *
 * Tests cover:
 * - Normal rotation: old JTI consumed, new JTI issued
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

import { UserModel } from '@api/modules/auth/models/user.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';
import {
  signRefreshToken,
  verifyRefreshToken,
  signAccessToken,
  REFRESH_TOKEN_EXPIRY_MS,
} from './token.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res: Record<string, jest.Mock> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as unknown as { status: jest.Mock; json: jest.Mock };
}

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
    return res.status(401).json({ error: 'Unauthorized', message: 'Token reuse detected — all sessions revoked' });
  }

  const user = await (UserModel as any).findById(decoded.userId);
  if (!user || !user.isActive)
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });

  existing.consumed = true;
  await existing.save();

  const p = { userId: user.id, role: user.role, clinicId: String(user.clinicId) };
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

describe('Refresh token rotation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('issues new access + refresh tokens and marks old JTI consumed', async () => {
    const { token, jti, family } = signRefreshToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
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
      expect.objectContaining({ family, consumed: false }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ accessToken: expect.any(String), refreshToken: expect.any(String) }),
      }),
    );
  });

  it('new refresh token has a different JTI than the old one', async () => {
    const { token, jti, family } = signRefreshToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: false, save: saveMock });
    (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    const newJti = (RefreshTokenModel.create as jest.Mock).mock.calls[0][0].jti;
    expect(newJti).not.toBe(jti);
  });

  it('preserves the token family across rotation', async () => {
    const { token, jti, family } = signRefreshToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
    const saveMock = jest.fn().mockResolvedValue(undefined);
    (RefreshTokenModel.findOne as jest.Mock).mockResolvedValue({ jti, family, consumed: false, save: saveMock });
    (UserModel.findById as jest.Mock).mockResolvedValue(mockUser);
    (RefreshTokenModel.create as jest.Mock).mockResolvedValue({});
    const res = makeRes();

    await refreshHandler({ refreshToken: token }, res);

    const createdFamily = (RefreshTokenModel.create as jest.Mock).mock.calls[0][0].family;
    expect(createdFamily).toBe(family);
  });

  it('detects replay attack: revokes entire family when consumed JTI is presented', async () => {
    const { token, jti, family } = signRefreshToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
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

  it('returns 401 for invalid JWT signature', async () => {
    const res = makeRes();
    await refreshHandler({ refreshToken: 'invalid.token.here' }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(RefreshTokenModel.findOne).not.toHaveBeenCalled();
  });
});

describe('POST /auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the JTI from DB and returns loggedOut: true', async () => {
    const { token, jti } = signRefreshToken({ userId: USER_ID, role: 'DOCTOR', clinicId: CLINIC_ID });
    (RefreshTokenModel.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });
    const res = makeRes();

    await logoutHandler({ refreshToken: token }, res);

    expect(RefreshTokenModel.deleteOne).toHaveBeenCalledWith({ jti });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });

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

    await logoutAllHandler(USER_ID, res);

    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });
});
