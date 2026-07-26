import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { authenticateApiKey, validateApiKeyScopes } from '../api-key.middleware';
import { ApiKeyModel, hashApiKey, generateApiKey } from '../models/api-key.model';
import { ApiKeyUsageModel } from '../models/api-key-usage.model';
import { PREDEFINED_SCOPES } from '../constants/scopes';

// Mock models
jest.mock('../models/api-key.model');
jest.mock('../models/api-key-usage.model');

describe('API Key Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/api/v1/patients',
      method: 'GET',
      ip: '192.168.1.100',
      get: jest.fn((header: string) => {
        if (header === 'user-agent') return 'test-agent';
        return undefined;
      }),
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateApiKey', () => {
    it('should skip non-API key requests', async () => {
      req.headers = { authorization: 'Bearer jwt_token' };

      await authenticateApiKey(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject missing API key', async () => {
      req.headers = {};

      await authenticateApiKey(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      const apiKey = generateApiKey();
      req.headers = { authorization: `Bearer ${apiKey}` };

      (ApiKeyModel.findOne as jest.Mock).mockResolvedValue(null);

      await authenticateApiKey(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    });

    it('should reject expired API key', async () => {
      const apiKey = generateApiKey();
      const hashedKey = hashApiKey(apiKey);
      req.headers = { authorization: `Bearer ${apiKey}` };

      const expiredKey = {
        _id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      (ApiKeyModel.findOne as jest.Mock).mockResolvedValue(expiredKey);
      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await authenticateApiKey(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'API key has expired',
      });
    });

    it('should attach valid API key to request', async () => {
      const apiKey = generateApiKey();
      req.headers = { authorization: `Bearer ${apiKey}` };

      const validKey = {
        _id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
        expiresAt: new Date(Date.now() + 1000000), // Expires in future
      };

      (ApiKeyModel.findOne as jest.Mock).mockResolvedValue(validKey);
      (ApiKeyModel.updateOne as jest.Mock).mockResolvedValue({});

      await authenticateApiKey(req as Request, res as Response, next);

      expect(req.apiKey).toEqual({
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      });
      expect(next).toHaveBeenCalled();
    });

    it('should update lastUsedAt timestamp', async () => {
      const apiKey = generateApiKey();
      req.headers = { authorization: `Bearer ${apiKey}` };

      const validKey = {
        _id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
        expiresAt: null,
      };

      (ApiKeyModel.findOne as jest.Mock).mockResolvedValue(validKey);
      (ApiKeyModel.updateOne as jest.Mock).mockResolvedValue({});

      await authenticateApiKey(req as Request, res as Response, next);

      expect(ApiKeyModel.updateOne).toHaveBeenCalledWith(
        { _id: 'key-id' },
        { lastUsedAt: expect.any(Date) }
      );
    });
  });

  describe('validateApiKeyScopes', () => {
    it('should skip non-API key requests', async () => {
      req.apiKey = undefined;

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow request with matching scope', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      };
      req.path = '/api/v1/patients';
      req.method = 'GET';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny request without matching scope', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      };
      req.path = '/api/v1/payments';
      req.method = 'GET';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'API key does not have permission to access this endpoint',
        requiredScopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      });
    });

    it('should log successful scope validation', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      };
      req.path = '/api/v1/patients';
      req.method = 'GET';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(ApiKeyUsageModel.create).toHaveBeenCalledWith({
        apiKeyId: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        method: 'GET',
        endpoint: '/api/v1/patients',
        statusCode: 200,
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
        scopeGranted: true,
        ipAddress: '192.168.1.100',
        userAgent: 'test-agent',
        errorMessage: undefined,
      });
    });

    it('should log failed scope validation', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      };
      req.path = '/api/v1/payments';
      req.method = 'GET';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(ApiKeyUsageModel.create).toHaveBeenCalledWith({
        apiKeyId: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        method: 'GET',
        endpoint: '/api/v1/payments',
        statusCode: 403,
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
        scopeGranted: false,
        ipAddress: '192.168.1.100',
        userAgent: 'test-agent',
        errorMessage: 'Insufficient scopes',
      });
    });

    it('should allow multiple scopes', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ, PREDEFINED_SCOPES.ENCOUNTERS_READ],
      };
      req.path = '/api/v1/encounters';
      req.method = 'GET';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny write operation with read-only scope', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_READ],
      };
      req.path = '/api/v1/patients';
      req.method = 'POST';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should allow write operation with write scope', async () => {
      req.apiKey = {
        id: 'key-id',
        userId: 'user-id',
        clinicId: 'clinic-id',
        scopes: [PREDEFINED_SCOPES.PATIENTS_WRITE],
      };
      req.path = '/api/v1/patients';
      req.method = 'POST';

      (ApiKeyUsageModel.create as jest.Mock).mockResolvedValue({});

      await validateApiKeyScopes(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
