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
import {
  signRefreshToken,
  verifyRefreshToken,
  signAccessToken,
  REFRESH_TOKEN_EXPIRY_MS,
  TokenPayload,
} from './token.service';
import { UserModel } from '@api/modules/auth/models/user.model';
import { RefreshTokenModel } from '@api/modules/auth/models/refresh-token.model';

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
  const { token: newRefreshToken, jti, family } = signRefreshToken(p, decoded.family);
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

    expect(existing.consumed).toBe(true);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(RefreshTokenModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ family, consumed: false }),
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

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for invalid/malformed refresh token', async () => {
    const res = makeRes();

    await refreshHandler('not.a.valid.token', res);

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

    expect(RefreshTokenModel.deleteOne).toHaveBeenCalledWith({ jti });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });

  it('returns success even for invalid token (graceful logout)', async () => {
    const res = makeRes();

    await logoutHandler('invalid.token', res);

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
