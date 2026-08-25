import { Request, Response } from 'express';
import { exportRateLimit } from '../export-rate-limit.middleware';

function mockRes() {
  const res: Partial<Response> = {};
  res.set = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

function mockReq(clinicId?: string): Request {
  return { user: clinicId ? { clinicId, userId: 'u1', role: 'DOCTOR' } : undefined } as Request;
}

describe('exportRateLimit', () => {
  it('returns 401 when there is no clinic context', () => {
    const res = mockRes();
    const next = jest.fn();

    exportRateLimit(mockReq(undefined), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows requests within the limit and sets rate-limit headers', () => {
    const clinicId = `clinic-${Date.now()}-a`;
    const res = mockRes();
    const next = jest.fn();

    exportRateLimit(mockReq(clinicId), res, next);

    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 429 after exceeding the per-clinic limit', () => {
    const clinicId = `clinic-${Date.now()}-b`;
    const next = jest.fn();

    for (let i = 0; i < 5; i++) {
      const res = mockRes();
      exportRateLimit(mockReq(clinicId), res, next);
    }

    const res = mockRes();
    exportRateLimit(mockReq(clinicId), res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TooManyRequests' })
    );
  });

  it('tracks separate clinics independently', () => {
    const clinicA = `clinic-${Date.now()}-c1`;
    const clinicB = `clinic-${Date.now()}-c2`;

    for (let i = 0; i < 5; i++) {
      exportRateLimit(mockReq(clinicA), mockRes(), jest.fn());
    }

    const resB = mockRes();
    const next = jest.fn();
    exportRateLimit(mockReq(clinicB), resB, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(resB.status).not.toHaveBeenCalled();
  });
});
