/**
 * Tests for automatic logoff after inactivity (Issue #1495).
 *
 *  - GET  /auth/session-policy returns the clinic's idle timeout (default 15 min)
 *  - POST /auth/logout with reason=idle_timeout revokes the whole refresh-token family
 */
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
jest.mock('@api/modules/auth/models/refresh-token.model', () => ({
  RefreshTokenModel: { create: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() },
}));
jest.mock('@api/modules/clinics/clinic-settings.model', () => ({
  ...jest.requireActual('@api/modules/clinics/clinic-settings.model'),
  ClinicSettingsModel: { findOne: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import { authRoutes } from './auth.controller';
import { signRefreshToken } from './token.service';
import { RefreshTokenModel } from './models/refresh-token.model';
import { ClinicSettingsModel } from '../clinics/clinic-settings.model';
import { auditLog } from '../audit/audit.service';

const app = express();
app.use(express.json());
app.use('/api/v1/auth', authRoutes);

const USER = {
  userId: '507f1f77bcf86cd799439022',
  role: 'DOCTOR',
  clinicId: '507f1f77bcf86cd799439011',
};

function mockSettings(value: unknown) {
  (ClinicSettingsModel.findOne as jest.Mock).mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(value) }),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('GET /auth/session-policy', () => {
  it("returns the clinic's configured idle timeout", async () => {
    mockSettings({ security: { idleTimeoutMinutes: 10 } });

    const res = await request(app)
      .get('/api/v1/auth/session-policy')
      .set('x-test-user', JSON.stringify(USER));

    expect(res.status).toBe(200);
    expect(ClinicSettingsModel.findOne).toHaveBeenCalledWith({ clinicId: USER.clinicId });
    expect(res.body.data).toEqual({ idleTimeoutMinutes: 10, warningSeconds: 60 });
  });

  it('defaults to 15 minutes when the clinic has no settings yet', async () => {
    mockSettings(null);

    const res = await request(app)
      .get('/api/v1/auth/session-policy')
      .set('x-test-user', JSON.stringify(USER));

    expect(res.body.data.idleTimeoutMinutes).toBe(15);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/auth/session-policy');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the entire refresh-token family on idle timeout and audits it', async () => {
    const { token, family } = signRefreshToken(USER);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: token, reason: 'idle_timeout' });

    expect(res.status).toBe(200);
    expect(RefreshTokenModel.deleteMany).toHaveBeenCalledWith({ family });
    expect(RefreshTokenModel.deleteOne).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER.userId,
        metadata: { event: 'session_idle_timeout' },
      }),
      expect.anything()
    );
  });

  it('keeps revoking only the presented token on a regular logout', async () => {
    const { token, jti } = signRefreshToken(USER);

    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: token });

    expect(res.status).toBe(200);
    expect(RefreshTokenModel.deleteOne).toHaveBeenCalledWith({ jti });
    expect(RefreshTokenModel.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown logout reason', async () => {
    const { token } = signRefreshToken(USER);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: token, reason: 'whatever' });

    expect(res.status).toBe(400);
  });
});
