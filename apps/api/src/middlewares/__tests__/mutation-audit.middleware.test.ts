import express, { Request, Response } from 'express';
import request from 'supertest';
import { mutationAuditMiddleware } from '../mutation-audit.middleware';

jest.mock('../../modules/audit/audit.service', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

import { auditLog } from '../../modules/audit/audit.service';
const mockAuditLog = auditLog as jest.Mock;

function makeApp(method: string, statusCode = 200) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res, next) => {
    (req as any).user = { userId: 'user-1', clinicId: 'clinic-1', role: 'DOCTOR' };
    next();
  });
  app.use(mutationAuditMiddleware);
  app.all('/test/:id', (_req: Request, res: Response) => res.status(statusCode).json({ ok: true }));
  return app;
}

beforeEach(() => mockAuditLog.mockClear());

describe('mutationAuditMiddleware', () => {
  it('logs MUTATION_CREATE for POST 2xx', async () => {
    await request(makeApp('POST')).post('/test/123').send({});
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MUTATION_CREATE', resourceId: '123' }),
      expect.anything(),
    );
  });

  it('logs MUTATION_UPDATE for PUT 2xx', async () => {
    await request(makeApp('PUT')).put('/test/456').send({});
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MUTATION_UPDATE', resourceId: '456' }),
      expect.anything(),
    );
  });

  it('logs MUTATION_UPDATE for PATCH 2xx', async () => {
    await request(makeApp('PATCH')).patch('/test/789').send({});
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MUTATION_UPDATE' }),
      expect.anything(),
    );
  });

  it('logs MUTATION_DELETE for DELETE 2xx', async () => {
    await request(makeApp('DELETE')).delete('/test/abc');
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MUTATION_DELETE' }),
      expect.anything(),
    );
  });

  it('does NOT log for GET requests', async () => {
    const app = makeApp('GET');
    await request(app).get('/test/1');
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('does NOT log for 4xx responses', async () => {
    const app = makeApp('POST', 400);
    await request(app).post('/test/1').send({});
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('includes userId and clinicId from req.user', async () => {
    await request(makeApp('POST')).post('/test/1').send({});
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', clinicId: 'clinic-1' }),
      expect.anything(),
    );
  });
});
