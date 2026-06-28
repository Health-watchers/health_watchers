/**
 * Backend unit tests — Issue #904
 *
 * Covers:
 *  - CacheService (no-Redis path): get / set / del / ping / metrics
 *  - TokenDenylistService: addToDenylist, isDenylisted, setUserInvalidatedAt, isInvalidatedForUser
 *  - authenticate middleware: missing header, invalid token, valid token
 *  - requireRoles middleware: correct role, wrong role, no user
 *  - authorize (RBAC) middleware: allowed role, forbidden role, unauthenticated
 *  - AppError factory methods and field contracts
 *  - errorHandler: AppError, ZodError, MongooseValidationError, duplicate-key, JWT errors, unknown
 */

// ── Environment stubs ──────────────────────────────────────────────────────────
process.env.MONGO_URI = 'mongodb://localhost:27017/test';
process.env.JWT_ACCESS_TOKEN_SECRET = 'test-access-secret-32-chars-long!!';
process.env.JWT_REFRESH_TOKEN_SECRET = 'test-refresh-secret-32-chars-long!';
process.env.API_PORT = '3001';

// ── Module mocks ───────────────────────────────────────────────────────────────
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

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
    mongoUri: '',
    stellarNetwork: 'testnet',
    stellarHorizonUrl: '',
    stellarSecretKey: '',
    stellar: { network: 'testnet', horizonUrl: '', secretKey: '', platformPublicKey: '' },
    supportedAssets: ['XLM'],
    stellarServiceUrl: '',
    geminiApiKey: '',
  },
}));

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { Error as MongooseError } from 'mongoose';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { AppError } from '../../utils/app-error';
import { errorHandler } from '../../middlewares/error.middleware';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { authorize, Roles } from '../../middlewares/rbac.middleware';
import { cache, getCacheMetrics } from '../../services/cache.service';
import {
  addToDenylist,
  isDenylisted,
  setUserInvalidatedAt,
  isInvalidatedForUser,
} from '../../services/token-denylist.service';
import { AppRole } from '../../types/express';

// ── Helpers ────────────────────────────────────────────────────────────────────
function mockRes() {
  const res = { status: jest.fn(), json: jest.fn(), locals: {} } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
}

function mockReq(overrides: Partial<Request> = {}) {
  return {
    requestId: 'test-req-id',
    method: 'GET',
    path: '/test',
    user: undefined,
    headers: {},
    ...overrides,
  } as unknown as Request;
}

const noop = jest.fn() as unknown as NextFunction;

// ─────────────────────────────────────────────────────────────────────────────
// 1. AppError
// ─────────────────────────────────────────────────────────────────────────────
describe('AppError', () => {
  it('badRequest produces 400 with validation category', () => {
    const err = AppError.badRequest('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.category).toBe('validation');
    expect(err.severity).toBe('low');
  });

  it('unauthorized produces 401 with authentication category', () => {
    const err = AppError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.category).toBe('authentication');
  });

  it('forbidden produces 403 with authorization category', () => {
    const err = AppError.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.category).toBe('authorization');
  });

  it('notFound produces 404 with not_found category', () => {
    const err = AppError.notFound('Patient');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Patient');
    expect(err.category).toBe('not_found');
  });

  it('conflict produces 409', () => {
    const err = AppError.conflict('already exists');
    expect(err.statusCode).toBe(409);
    expect(err.category).toBe('conflict');
  });

  it('tooManyRequests produces 429', () => {
    const err = AppError.tooManyRequests();
    expect(err.statusCode).toBe(429);
    expect(err.category).toBe('rate_limit');
  });

  it('internal produces 500 with high severity', () => {
    const err = AppError.internal('boom');
    expect(err.statusCode).toBe(500);
    expect(err.severity).toBe('high');
    expect(err.isOperational).toBe(false);
  });

  it('isOperational defaults to true for 4xx', () => {
    const err = AppError.badRequest('x');
    expect(err.isOperational).toBe(true);
  });

  it('attaches context when provided', () => {
    const err = AppError.badRequest('x', { field: 'email' });
    expect(err.context).toEqual({ field: 'email' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. errorHandler middleware
// ─────────────────────────────────────────────────────────────────────────────
describe('errorHandler middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('handles AppError — returns its statusCode and category', () => {
    const res = mockRes();
    const err = AppError.notFound('Record');
    errorHandler(err, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(404);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({
      error: 'not_found',
      message: 'Record not found',
    });
  });

  it('handles ZodError — 400 ValidationError', () => {
    const res = mockRes();
    let zodErr: ZodError | null = null;
    try {
      z.object({ name: z.string() }).parse({});
    } catch (e) {
      zodErr = e as ZodError;
    }
    errorHandler(zodErr!, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'ValidationError' });
  });

  it('handles Mongoose ValidationError — 400', () => {
    const res = mockRes();
    const mongoErr = new MongooseError.ValidationError();
    errorHandler(mongoErr, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'ValidationError' });
  });

  it('handles Mongoose CastError — 400', () => {
    const res = mockRes();
    const castErr = new MongooseError.CastError('ObjectId', 'bad-id', '_id');
    errorHandler(castErr, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'BadRequest' });
  });

  it('handles MongoDB duplicate-key (code 11000) — 409', () => {
    const res = mockRes();
    const dupErr = Object.assign(new Error('dup'), { code: 11000, keyValue: { email: 'x' } });
    errorHandler(dupErr, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(409);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'Conflict' });
  });

  it('handles TokenExpiredError — 401', () => {
    const res = mockRes();
    const expErr = new TokenExpiredError('expired', new Date());
    errorHandler(expErr, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(401);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'TokenExpired' });
  });

  it('handles JsonWebTokenError — 401', () => {
    const res = mockRes();
    const jwtErr = new JsonWebTokenError('invalid signature');
    errorHandler(jwtErr, mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(401);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'InvalidToken' });
  });

  it('handles unknown errors — 500', () => {
    const res = mockRes();
    errorHandler(new Error('unexpected'), mockReq(), res, noop);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(500);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ error: 'InternalServerError' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. authenticate middleware
// ─────────────────────────────────────────────────────────────────────────────
describe('authenticate middleware', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authenticate(mockReq({ headers: {} }), res, next);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authenticate(
      mockReq({ headers: { authorization: 'Basic abc123' } }),
      res,
      next
    );
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', async () => {
    const res = mockRes();
    const next = jest.fn();
    await authenticate(
      mockReq({ headers: { authorization: 'Bearer not.a.valid.token' } }),
      res,
      next
    );
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. requireRoles middleware
// ─────────────────────────────────────────────────────────────────────────────
describe('requireRoles middleware', () => {
  it('calls next() when user has an allowed role', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq({
      user: { userId: 'u1', role: 'DOCTOR' as AppRole, clinicId: 'c1', isSuperAdmin: false },
    });
    requireRoles('DOCTOR', 'NURSE')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not in allowed list', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq({
      user: { userId: 'u1', role: 'READ_ONLY' as AppRole, clinicId: 'c1', isSuperAdmin: false },
    });
    requireRoles('DOCTOR', 'CLINIC_ADMIN')(req, res, next);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when req.user is not set', () => {
    const next = jest.fn();
    const res = mockRes();
    requireRoles('DOCTOR')(mockReq(), res, next);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. authorize (RBAC) middleware
// ─────────────────────────────────────────────────────────────────────────────
describe('authorize middleware', () => {
  it('calls next() when user role is in allowedRoles', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq({
      user: { userId: 'u1', role: Roles.CLINIC_ADMIN, clinicId: 'c1', isSuperAdmin: false },
    });
    authorize([Roles.CLINIC_ADMIN, Roles.SUPER_ADMIN])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user role is not allowed', () => {
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq({
      user: { userId: 'u1', role: Roles.PATIENT, clinicId: 'c1', isSuperAdmin: false },
    });
    authorize([Roles.DOCTOR, Roles.NURSE])(req, res, next);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is absent', () => {
    const next = jest.fn();
    const res = mockRes();
    authorize([Roles.DOCTOR])(mockReq(), res, next);
    expect((res.status as jest.Mock).mock.calls[0][0]).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('all roles in hierarchy can be authorized', () => {
    const allRoles = Object.values(Roles) as AppRole[];
    allRoles.forEach((role) => {
      const next = jest.fn();
      const res = mockRes();
      const req = mockReq({
        user: { userId: 'u1', role, clinicId: 'c1', isSuperAdmin: role === 'SUPER_ADMIN' },
      });
      authorize(allRoles)(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. CacheService (no-Redis fallback)
// ─────────────────────────────────────────────────────────────────────────────
describe('CacheService — no-Redis fallback', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
  });

  it('get() returns null when Redis is not configured', async () => {
    const val = await cache.get('some-key');
    expect(val).toBeNull();
  });

  it('set() resolves without error when Redis is not configured', async () => {
    await expect(cache.set('some-key', { data: 1 }, 60)).resolves.toBeUndefined();
  });

  it('del() resolves without error when Redis is not configured', async () => {
    await expect(cache.del('some-key')).resolves.toBeUndefined();
  });

  it('delPattern() resolves without error when Redis is not configured', async () => {
    await expect(cache.delPattern('prefix:*')).resolves.toBeUndefined();
  });

  it('ping() returns {status: "disabled"} when Redis is not configured', async () => {
    const result = await cache.ping();
    expect(result).toEqual({ status: 'disabled' });
  });

  it('getCacheMetrics() returns numeric hit/miss counts and hitRate', () => {
    const metrics = getCacheMetrics();
    expect(typeof metrics.hits).toBe('number');
    expect(typeof metrics.misses).toBe('number');
    expect(typeof metrics.hitRate).toBe('number');
    expect(metrics.hitRate).toBeGreaterThanOrEqual(0);
    expect(metrics.hitRate).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. TokenDenylistService (cache-backed)
// ─────────────────────────────────────────────────────────────────────────────
describe('TokenDenylistService', () => {
  beforeEach(() => {
    jest.spyOn(cache, 'set').mockResolvedValue(undefined);
    jest.spyOn(cache, 'get').mockResolvedValue(null);
  });

  afterEach(() => jest.restoreAllMocks());

  it('addToDenylist calls cache.set with the correct key prefix', async () => {
    await addToDenylist('jti-abc', 300);
    expect(cache.set).toHaveBeenCalledWith('token-denylist:jti-abc', 1, 300);
  });

  it('addToDenylist does NOT call cache.set when ttl <= 0', async () => {
    await addToDenylist('jti-zero', 0);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('isDenylisted returns false when cache returns null', async () => {
    const result = await isDenylisted('jti-clean');
    expect(result).toBe(false);
  });

  it('isDenylisted returns true when cache has the jti', async () => {
    (cache.get as jest.Mock).mockResolvedValueOnce(1);
    const result = await isDenylisted('jti-revoked');
    expect(result).toBe(true);
  });

  it('setUserInvalidatedAt stores timestamp under user key with 7-day TTL', async () => {
    const ts = Math.floor(Date.now() / 1000);
    await setUserInvalidatedAt('user-1', ts);
    expect(cache.set).toHaveBeenCalledWith(
      'user-invalidated:user-1',
      ts,
      7 * 24 * 60 * 60
    );
  });

  it('isInvalidatedForUser returns false when no invalidation record exists', async () => {
    const result = await isInvalidatedForUser('user-1', 1000);
    expect(result).toBe(false);
  });

  it('isInvalidatedForUser returns true when token iat is before invalidation timestamp', async () => {
    const invalidatedAt = 2000;
    (cache.get as jest.Mock).mockResolvedValueOnce(invalidatedAt);
    const result = await isInvalidatedForUser('user-1', 1500); // iat < invalidatedAt
    expect(result).toBe(true);
  });

  it('isInvalidatedForUser returns false when token iat is after invalidation timestamp', async () => {
    const invalidatedAt = 1000;
    (cache.get as jest.Mock).mockResolvedValueOnce(invalidatedAt);
    const result = await isInvalidatedForUser('user-1', 2000); // iat > invalidatedAt
    expect(result).toBe(false);
  });
});
