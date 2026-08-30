import crypto from 'crypto';
import { Request, Response } from 'express';
import { authenticateApiKey, requireScope } from '../api-key.middleware';
import { ApiKeyModel } from '../../modules/api-keys/models/api-key.model';
import { ApiKeyUsageModel } from '../../modules/api-keys/models/api-key-usage.model';

jest.mock('../../modules/api-keys/models/api-key.model', () => ({
  ApiKeyModel: { findOne: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

jest.mock('../../modules/api-keys/models/api-key-usage.model', () => ({
  ApiKeyUsageModel: { findOneAndUpdate: jest.fn() },
}));

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res as Response);
  return res as Response;
}

function findOneChain(result: unknown) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(result) }) };
}

describe('authenticateApiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ApiKeyModel.findByIdAndUpdate as jest.Mock).mockReturnValue({ exec: jest.fn() });
    (ApiKeyUsageModel.findOneAndUpdate as jest.Mock).mockReturnValue({ exec: jest.fn() });
  });

  it('returns 401 when the Authorization header is missing the ApiKey scheme', async () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the key does not have the hw_ prefix', async () => {
    const req = { headers: { authorization: 'ApiKey nothw_123' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid API key format' })
    );
  });

  it('returns 401 when no matching active key is found', async () => {
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(findOneChain(null));
    const req = { headers: { authorization: 'ApiKey hw_abc123' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or deactivated API key' })
    );
  });

  it('returns 401 when the key has expired', async () => {
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(
      findOneChain({
        _id: 'k1',
        createdBy: 'u1',
        clinicId: 'c1',
        scopes: ['read'],
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
      })
    );
    const req = { headers: { authorization: 'ApiKey hw_abc123' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'API key has expired' })
    );
  });

  it('returns 401 when the key has been revoked', async () => {
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(
      findOneChain({
        _id: 'k1',
        createdBy: 'u1',
        clinicId: 'c1',
        scopes: ['read'],
        isActive: false,
        revokedAt: new Date(),
      })
    );
    const req = { headers: { authorization: 'ApiKey hw_abc123' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'API key has been revoked' })
    );
  });

  it('attaches user + apiKey context and calls next for a valid key', async () => {
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(
      findOneChain({
        _id: 'k1',
        createdBy: 'u1',
        clinicId: 'c1',
        scopes: ['read', 'write'],
        isActive: true,
        environment: 'live',
        rateLimitPerMin: 120,
      })
    );
    const req = {
      headers: { authorization: 'ApiKey hw_abc123' },
      path: '/api/v2/patients',
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(req.user).toEqual({ userId: 'u1', role: 'READ_ONLY', clinicId: 'c1' });
    expect((req as any).apiKey).toEqual(
      expect.objectContaining({
        id: 'k1',
        scopes: ['read', 'write'],
        environment: 'live',
        rateLimitPerMin: 120,
        viaPreviousKey: false,
      })
    );
    expect(ApiKeyModel.findByIdAndUpdate).toHaveBeenCalledWith('k1', {
      lastUsedAt: expect.any(Date),
    });
    expect(ApiKeyUsageModel.findOneAndUpdate).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('accepts a superseded key while the rotation grace window is open', async () => {
    const presentedHash = crypto.createHash('sha256').update('hw_old').digest('hex');
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(
      findOneChain({
        _id: 'k1',
        createdBy: 'u1',
        clinicId: 'c1',
        scopes: ['read'],
        isActive: true,
        keyHash: 'different-current-hash',
        previousKeyHash: presentedHash,
        previousKeyExpiresAt: new Date(Date.now() + 3600_000),
      })
    );
    const req = { headers: { authorization: 'ApiKey hw_old' }, path: '/x' } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).apiKey.viaPreviousKey).toBe(true);
  });

  it('rejects a superseded key once the grace window has closed', async () => {
    const presentedHash = crypto.createHash('sha256').update('hw_old').digest('hex');
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(
      findOneChain({
        _id: 'k1',
        createdBy: 'u1',
        clinicId: 'c1',
        scopes: ['read'],
        isActive: true,
        keyHash: 'different-current-hash',
        previousKeyHash: presentedHash,
        previousKeyExpiresAt: new Date(Date.now() - 1000),
      })
    );
    const req = { headers: { authorization: 'ApiKey hw_old' }, path: '/x' } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('hashes the raw key with sha256 and matches current or previous hash', async () => {
    (ApiKeyModel.findOne as jest.Mock).mockReturnValue(findOneChain(null));
    const req = { headers: { authorization: 'ApiKey hw_secret' } } as Request;
    const res = mockRes();
    const next = jest.fn();

    await authenticateApiKey(req, res, next);

    const expectedHash = crypto.createHash('sha256').update('hw_secret').digest('hex');
    expect(ApiKeyModel.findOne).toHaveBeenCalledWith({
      $or: [{ keyHash: expectedHash }, { previousKeyHash: expectedHash }],
    });
  });
});

describe('requireScope', () => {
  it('returns 403 when no API key context is present', () => {
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn();

    requireScope('read' as any)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the scope is missing', () => {
    const req = { apiKey: { scopes: ['write'] } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    requireScope('read' as any)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Missing required scope: read' })
    );
  });

  it('calls next when the scope is present', () => {
    const req = { apiKey: { scopes: ['read', 'write'] } } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    requireScope('read' as any)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
