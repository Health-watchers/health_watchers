import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response } from 'express';
import { rotateApiKey, revokeApiKey, createApiKey } from '../api-keys.controller';
import { ApiKeyModel } from '../models/api-key.model';
import { AuditService } from '../../audit/audit.service';

jest.mock('../models/api-key.model');
jest.mock('../models/api-key-usage.model');
jest.mock('../../audit/audit.service');
jest.mock('../../../utils/logger', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockUser = { userId: 'user1', clinicId: 'clinic1', role: 'CLINIC_ADMIN' };

const makeReq = (params = {}, body = {}): Partial<Request> => ({
  params: params as any,
  body,
  user: mockUser as any,
  headers: {},
  ip: '127.0.0.1',
});

const makeRes = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const lean = (val: unknown) => jest.fn().mockResolvedValue(val);

describe('API Key Management', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('rotateApiKey', () => {
    it('should rotate key and return new raw key', async () => {
      const existing = {
        _id: 'key1', name: 'Test Key', prefix: 'hw_oldpref',
        scopes: ['patients:read'], expiresAt: null, clinicId: 'clinic1', isActive: true,
      };
      const rotated = { ...existing, prefix: 'hw_newpref', isActive: true };

      (ApiKeyModel.findOne as jest.Mock).mockReturnValue({ lean: lean(existing) });
      (ApiKeyModel.findByIdAndUpdate as jest.Mock).mockReturnValue({ lean: lean(rotated) });
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const req = makeReq({ id: 'key1' });
      const res = makeRes();
      await rotateApiKey(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.objectContaining({ key: expect.stringMatching(/^hw_/) }),
        })
      );
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'API_KEY_ROTATE' }), req
      );
    });

    it('should generate a different key on each rotation', async () => {
      const existing = { _id: 'key1', name: 'K', prefix: 'hw_old', scopes: [], clinicId: 'clinic1' };
      const rotated = { ...existing, isActive: true, expiresAt: null };

      (ApiKeyModel.findOne as jest.Mock).mockReturnValue({ lean: lean(existing) });
      (ApiKeyModel.findByIdAndUpdate as jest.Mock).mockReturnValue({ lean: lean(rotated) });
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const res1 = makeRes();
      const res2 = makeRes();
      await rotateApiKey(makeReq({ id: 'key1' }) as Request, res1 as Response);
      await rotateApiKey(makeReq({ id: 'key1' }) as Request, res2 as Response);

      const key1 = (res1.json as jest.Mock).mock.calls[0][0].data.key;
      const key2 = (res2.json as jest.Mock).mock.calls[0][0].data.key;
      expect(key1).not.toBe(key2);
    });

    it('should return 404 when key not found', async () => {
      (ApiKeyModel.findOne as jest.Mock).mockReturnValue({ lean: lean(null) });
      const res = makeRes();
      await rotateApiKey(makeReq({ id: 'notexist' }) as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should not audit on 404', async () => {
      (ApiKeyModel.findOne as jest.Mock).mockReturnValue({ lean: lean(null) });
      await rotateApiKey(makeReq({ id: 'x' }) as Request, makeRes() as Response);
      expect(AuditService.log).not.toHaveBeenCalled();
    });
  });

  describe('revokeApiKey', () => {
    it('should set isActive to false and audit', async () => {
      const key = { _id: 'key1', name: 'Test', isActive: false, clinicId: 'clinic1' };
      (ApiKeyModel.findOneAndUpdate as jest.Mock).mockReturnValue({ lean: lean(key) });
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const res = makeRes();
      await revokeApiKey(makeReq({ id: 'key1' }) as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
      );
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'API_KEY_REVOKE' }), expect.anything()
      );
    });
  });

  describe('createApiKey', () => {
    it('should return raw key only once and audit creation', async () => {
      const created = {
        _id: 'newkey', name: 'My Key', prefix: 'hw_abc',
        scopes: ['patients:read'], isActive: true, expiresAt: null, createdAt: new Date(),
      };
      (ApiKeyModel.create as jest.Mock).mockResolvedValue(created);
      (AuditService.log as jest.Mock).mockResolvedValue(undefined);

      const req = makeReq({}, { name: 'My Key', scopes: ['patients:read'] });
      const res = makeRes();
      await createApiKey(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      const data = (res.json as jest.Mock).mock.calls[0][0].data;
      expect(data.key).toMatch(/^hw_/);
      expect(AuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'API_KEY_CREATE' }), expect.anything()
      );
    });

    it('should return 400 when name is missing', async () => {
      const res = makeRes();
      await createApiKey(makeReq({}, {}) as Request, res as Response);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
