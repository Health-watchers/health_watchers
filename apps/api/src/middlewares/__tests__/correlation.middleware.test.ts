import { Request, Response } from 'express';
import { correlationMiddleware, CORRELATION_HEADER } from '../correlation.middleware';

function mockRes() {
  const res: Partial<Response> = { setHeader: jest.fn() };
  return res as Response;
}

describe('correlationMiddleware', () => {
  it('stamps req.requestId from req.id and echoes the header', () => {
    const req = { id: 'req-abc-123' } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    correlationMiddleware(req, res, next);

    expect(req.requestId).toBe('req-abc-123');
    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_HEADER, 'req-abc-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('exports the correlation header name as x-request-id', () => {
    expect(CORRELATION_HEADER).toBe('x-request-id');
  });
});
