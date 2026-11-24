import { Request, Response } from 'express';
import { authorize, Roles } from '../rbac.middleware';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('authorize', () => {
  it('returns 401 when there is no authenticated user', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    authorize([Roles.DOCTOR])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user role is not in the allow list', () => {
    const req = { user: { userId: 'u1', role: Roles.NURSE, clinicId: 'c1' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authorize([Roles.DOCTOR, Roles.CLINIC_ADMIN])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the user role is allowed', () => {
    const req = { user: { userId: 'u1', role: Roles.DOCTOR, clinicId: 'c1' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    authorize([Roles.DOCTOR, Roles.CLINIC_ADMIN])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
