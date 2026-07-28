import { Request, Response, NextFunction } from 'express';
import { correlationMiddleware, CORRELATION_HEADER } from '../correlation.middleware';

function mockReq(overrides: Partial<Record<string, unknown>> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    setHeader: jest.fn(),
  } as unknown as Response;
  return res;
}

const noop = jest.fn() as unknown as NextFunction;

describe('correlationMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('copies req.id onto req.requestId', () => {
    const req = mockReq({ id: 'abc-123' }) as any;
    const res = mockRes();
    correlationMiddleware(req, res, noop);
    expect(req.requestId).toBe('abc-123');
  });

  it('echoes the id back as X-Request-ID response header', () => {
    const req = mockReq({ id: 'echo-id' }) as any;
    const res = mockRes();
    correlationMiddleware(req, res, noop);
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_HEADER, 'echo-id');
  });

  it('calls next()', () => {
    const req = mockReq({ id: 'some-id' }) as any;
    const res = mockRes();
    correlationMiddleware(req, res, noop);
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('handles undefined req.id without throwing', () => {
    const req = mockReq() as any; // no id set
    const res = mockRes();
    expect(() => correlationMiddleware(req, res, noop)).not.toThrow();
    expect(noop).toHaveBeenCalledTimes(1);
  });

  it('sets req.requestId to undefined when req.id is absent', () => {
    const req = mockReq() as any;
    const res = mockRes();
    correlationMiddleware(req, res, noop);
    expect(req.requestId).toBeUndefined();
  });

  it('uses the CORRELATION_HEADER constant "x-request-id"', () => {
    expect(CORRELATION_HEADER).toBe('x-request-id');
  });
});
