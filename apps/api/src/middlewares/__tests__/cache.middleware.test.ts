import { Request, Response } from 'express';
import { cacheResponse } from '../cache.middleware';
import { cache } from '../../services/cache.service';

jest.mock('../../services/cache.service', () => ({
  cache: { get: jest.fn(), set: jest.fn() },
}));

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v2/patients',
    user: { clinicId: 'c1', userId: 'u1', role: 'DOCTOR' },
    ...overrides,
  } as Request;
}

function mockRes() {
  const res: Partial<Response> = { statusCode: 200 };
  res.json = jest.fn().mockImplementation(function (this: Response) {
    return this;
  });
  return res as Response;
}

describe('cacheResponse', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serves the cached value directly on a cache hit', async () => {
    (cache.get as jest.Mock).mockResolvedValue({ cached: true });
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await cacheResponse(60)(req, res, next);

    expect(cache.get).toHaveBeenCalledWith('c1:GET:/api/v2/patients');
    expect(res.json).toHaveBeenCalledWith({ cached: true });
    expect(next).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('calls next and caches the response body on a cache miss with a 2xx status', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);
    (cache.set as jest.Mock).mockResolvedValue(undefined);
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();

    await cacheResponse(30)(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    res.json({ fresh: true });
    await Promise.resolve();

    expect(cache.set).toHaveBeenCalledWith('c1:GET:/api/v2/patients', { fresh: true }, 30);
  });

  it('does not cache non-2xx responses', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    res.statusCode = 500;
    const next = jest.fn();

    await cacheResponse(30)(req, res, next);
    res.json({ error: 'boom' });
    await Promise.resolve();

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('uses a custom key function when provided', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    const keyFn = jest.fn().mockReturnValue('custom-key');

    await cacheResponse(30, keyFn)(req, res, next);

    expect(keyFn).toHaveBeenCalledWith(req);
    expect(cache.get).toHaveBeenCalledWith('custom-key');
  });

  it('falls back to a global cache key when there is no clinic context', async () => {
    (cache.get as jest.Mock).mockResolvedValue(null);
    const req = mockReq({ user: undefined });
    const res = mockRes();
    const next = jest.fn();

    await cacheResponse(30)(req, res, next);

    expect(cache.get).toHaveBeenCalledWith('global:GET:/api/v2/patients');
  });
});
