import { Request, Response } from 'express';
import { authenticate, requireRoles } from '../auth.middleware';
import { verifyAccessTokenAsync } from '../../modules/auth/token.service';

jest.mock('../../modules/auth/token.service', () => ({
  verifyAccessTokenAsync: jest.fn(),
}));

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('authenticate', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns 401 when the Authorization header is missing', async () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header is not a Bearer token', async () => {
    const req = { headers: { authorization: 'Basic abc' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid or expired', async () => {
    (verifyAccessTokenAsync as jest.Mock).mockResolvedValue(null);
    const req = { headers: { authorization: 'Bearer bad-token' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(verifyAccessTokenAsync).toHaveBeenCalledWith('bad-token');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next for a valid token', async () => {
    (verifyAccessTokenAsync as jest.Mock).mockResolvedValue({
      userId: 'u1',
      role: 'DOCTOR',
      clinicId: 'c1',
      patientId: undefined,
      jti: 'jti-1',
    });
    const req = { headers: { authorization: 'Bearer good-token' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual({
      userId: 'u1',
      role: 'DOCTOR',
      clinicId: 'c1',
      patientId: undefined,
      isSuperAdmin: false,
    });
    expect(req.tokenJti).toBe('jti-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('marks isSuperAdmin true when role is SUPER_ADMIN and flag is unset', async () => {
    (verifyAccessTokenAsync as jest.Mock).mockResolvedValue({
      userId: 'u1',
      role: 'SUPER_ADMIN',
      clinicId: 'c1',
    });
    const req = { headers: { authorization: 'Bearer good-token' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticate(req, res, next);

    expect(req.user?.isSuperAdmin).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireRoles', () => {
  it('returns 403 when there is no authenticated user', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRoles('DOCTOR')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the role is not permitted', () => {
    const req = { user: { userId: 'u1', role: 'NURSE', clinicId: 'c1' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRoles('DOCTOR', 'CLINIC_ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the role is permitted', () => {
    const req = { user: { userId: 'u1', role: 'DOCTOR', clinicId: 'c1' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRoles('DOCTOR', 'CLINIC_ADMIN')(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
