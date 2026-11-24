import { Request, Response, NextFunction } from 'express';
import { rateLimitMonitor } from '../rate-limit-monitor.middleware';

// Mock logger
jest.mock('@api/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import logger from '../../utils/logger';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: '127.0.0.1',
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'user-agent': 'test-agent',
    },
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const headers: Record<string, string> = {};
  const res: Partial<Response> = {
    statusCode: 200,
    json: jest.fn().mockReturnThis() as any,
    getHeader: jest.fn((name: string) => headers[name.toLowerCase()]) as any,
    setHeader: jest.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }) as any,
  };
  // Allow set to populate headers
  (res as any).set = jest.fn((name: string, value: string) => {
    headers[name.toLowerCase()] = value;
    return res;
  });
  return res as Response;
}

describe('rateLimitMonitor middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not log for successful (non-429) responses', () => {
    const req = mockReq();
    const res = mockRes();
    const next: NextFunction = jest.fn();

    rateLimitMonitor(req, res, next);

    expect(next).toHaveBeenCalled();

    // Simulate normal response
    res.statusCode = 200;
    res.json({ ok: true });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs structured event when status is 429', () => {
    const req = mockReq();
    const res = mockRes();
    const next: NextFunction = jest.fn();

    rateLimitMonitor(req, res, next);

    expect(next).toHaveBeenCalled();

    // Simulate rate-limited response
    res.statusCode = 429;
    res.json({ error: 'TooManyRequests' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'rate_limit_exceeded',
        ip: '127.0.0.1',
        path: '/api/v1/auth/login',
        method: 'POST',
      }),
      expect.stringContaining('rate limit exceeded')
    );
  });

  it('includes user context in log when authenticated', () => {
    const req = mockReq();
    (req as any).user = { userId: 'user-1', clinicId: 'clinic-1', role: 'DOCTOR' };
    const res = mockRes();
    const next: NextFunction = jest.fn();

    rateLimitMonitor(req, res, next);

    res.statusCode = 429;
    res.json({ error: 'TooManyRequests' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        clinicId: 'clinic-1',
      }),
      expect.any(String)
    );
  });

  it('logs null userId/clinicId for unauthenticated requests', () => {
    const req = mockReq();
    const res = mockRes();
    const next: NextFunction = jest.fn();

    rateLimitMonitor(req, res, next);

    res.statusCode = 429;
    res.json({ error: 'TooManyRequests' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        clinicId: null,
      }),
      expect.any(String)
    );
  });

  it('passes through the original json response body', () => {
    const req = mockReq();
    const res = mockRes();
    const originalJson = res.json;
    const next: NextFunction = jest.fn();

    rateLimitMonitor(req, res, next);

    res.statusCode = 429;
    const body = { error: 'TooManyRequests', message: 'Rate limit exceeded' };
    res.json(body);

    // The original json should have been called with the body
    expect(originalJson).toHaveBeenCalledWith(body);
  });
});
