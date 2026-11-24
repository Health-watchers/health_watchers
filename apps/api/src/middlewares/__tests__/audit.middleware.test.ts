import { Request, Response } from 'express';
import { auditMiddleware } from '../audit.middleware';
import { auditLog } from '../../modules/audit/audit.service';

jest.mock('../../modules/audit/audit.service', () => ({ auditLog: jest.fn() }));

function mockReqRes(params: Record<string, string> = {}) {
  const req = {
    params,
    user: { userId: 'u1', clinicId: 'c1', role: 'DOCTOR' },
  } as unknown as Request;

  const res: Partial<Response> = { statusCode: 200 };
  res.send = function send(this: Response, data: unknown) {
    return data as unknown as Response;
  } as Response['send'];

  return { req, res: res as Response };
}

describe('auditMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs a successful audit event when the response is 2xx', async () => {
    (auditLog as jest.Mock).mockResolvedValue(undefined);
    const { req, res } = mockReqRes({ id: 'patient-1' });
    const next = jest.fn();

    auditMiddleware('CREATE' as any, 'Patient')(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    res.send({ ok: true });
    // Allow the fire-and-forget promise chain to flush
    await Promise.resolve();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        resourceType: 'Patient',
        resourceId: 'patient-1',
        userId: 'u1',
        clinicId: 'c1',
        outcome: 'SUCCESS',
      }),
      req
    );
  });

  it('does not log when the response is not 2xx', async () => {
    const { req, res } = mockReqRes();
    res.statusCode = 404;
    const next = jest.fn();

    auditMiddleware('CREATE' as any)(req, res, next);
    res.send({ error: 'not found' });
    await Promise.resolve();

    expect(auditLog).not.toHaveBeenCalled();
  });

  it('swallows audit logging failures without throwing', async () => {
    (auditLog as jest.Mock).mockRejectedValue(new Error('db down'));
    const { req, res } = mockReqRes();
    const next = jest.fn();

    auditMiddleware('UPDATE' as any)(req, res, next);
    expect(() => res.send({ ok: true })).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
  });

  it('passes through the original send return value', () => {
    const { req, res } = mockReqRes();
    const next = jest.fn();

    auditMiddleware('READ' as any)(req, res, next);
    const result = res.send({ hello: 'world' });

    expect(result).toEqual({ hello: 'world' });
  });
});
