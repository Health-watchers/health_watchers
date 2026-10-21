import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';
import { apiKeyRateLimit, __resetApiKeyRateLimitBuckets } from '../api-key-rate-limit.middleware';

jest.mock('../../services/cache.service', () => ({
  cache: { incr: jest.fn().mockResolvedValue(null) }, // force local fallback
}));
jest.mock('../api-key.middleware', () => ({
  trackApiKeyUsage: jest.fn(),
}));

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  res.setHeader = jest.fn().mockReturnValue(res) as any;
  return res as Response;
}

describe('apiKeyRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetApiKeyRateLimitBuckets();
  });

  it('is a no-op when the key has no per-key limit', async () => {
    const req = {
      apiKey: { id: 'k1', clinicId: 'c1', rateLimitPerMin: 0 },
      path: '/x',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await apiKeyRateLimit()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('allows requests up to the limit then returns 429', async () => {
    const req = {
      apiKey: { id: 'k2', clinicId: 'c1', rateLimitPerMin: 3 },
      path: '/x',
    } as unknown as Request;
    const mw = apiKeyRateLimit();

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      const next = jest.fn();
      await mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    }

    const res = mockRes();
    const next = jest.fn();
    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets rate-limit headers', async () => {
    const req = {
      apiKey: { id: 'k3', clinicId: 'c1', rateLimitPerMin: 10 },
      path: '/x',
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    await apiKeyRateLimit()(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
  });
});
