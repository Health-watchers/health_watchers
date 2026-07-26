import express, { Request, Response } from 'express';
import request from 'supertest';
import { responseFilterMiddleware } from '../response-filter.middleware';

function makeApp(role?: string, body: unknown = {}) {
  const app = express();
  app.use((req: Request, _res, next) => {
    if (role) (req as any).user = { role };
    next();
  });
  app.use(responseFilterMiddleware);
  app.get('/test', (_req: Request, res: Response) => res.json(body));
  return app;
}

const SENSITIVE_PAYLOAD = {
  name: 'Alice',
  ssn: '123-45-6789',
  policyNumber: 'POL-001',
  groupNumber: 'GRP-001',
  billingCode: 'B001',
  paymentDetails: { amount: 100 },
  internalNotes: 'private note',
  auditTrail: ['action1'],
};

describe('responseFilterMiddleware', () => {
  it('SUPER_ADMIN sees all fields', async () => {
    const res = await request(makeApp('SUPER_ADMIN', SENSITIVE_PAYLOAD)).get('/test');
    expect(res.body).toMatchObject(SENSITIVE_PAYLOAD);
  });

  it('CLINIC_ADMIN sees all except nothing (has full access)', async () => {
    const res = await request(makeApp('CLINIC_ADMIN', SENSITIVE_PAYLOAD)).get('/test');
    expect(res.body.ssn).toBe(SENSITIVE_PAYLOAD.ssn);
    expect(res.body.billingCode).toBe(SENSITIVE_PAYLOAD.billingCode);
  });

  it('DOCTOR sees billing and insurance but not ssn or auditTrail', async () => {
    const res = await request(makeApp('DOCTOR', SENSITIVE_PAYLOAD)).get('/test');
    expect(res.body.billingCode).toBe(SENSITIVE_PAYLOAD.billingCode);
    expect(res.body.policyNumber).toBe(SENSITIVE_PAYLOAD.policyNumber);
    expect(res.body.ssn).toBeUndefined();
    expect(res.body.auditTrail).toBeUndefined();
  });

  it('NURSE sees insurance fields but not billing, ssn, or auditTrail', async () => {
    const res = await request(makeApp('NURSE', SENSITIVE_PAYLOAD)).get('/test');
    expect(res.body.policyNumber).toBe(SENSITIVE_PAYLOAD.policyNumber);
    expect(res.body.groupNumber).toBe(SENSITIVE_PAYLOAD.groupNumber);
    expect(res.body.billingCode).toBeUndefined();
    expect(res.body.ssn).toBeUndefined();
    expect(res.body.auditTrail).toBeUndefined();
    expect(res.body.internalNotes).toBeUndefined();
  });

  it('READ_ONLY sees no sensitive fields', async () => {
    const res = await request(makeApp('READ_ONLY', SENSITIVE_PAYLOAD)).get('/test');
    expect(res.body.name).toBe(SENSITIVE_PAYLOAD.name);
    expect(res.body.ssn).toBeUndefined();
    expect(res.body.policyNumber).toBeUndefined();
    expect(res.body.billingCode).toBeUndefined();
    expect(res.body.internalNotes).toBeUndefined();
  });

  it('PATIENT sees no sensitive fields', async () => {
    const res = await request(makeApp('PATIENT', SENSITIVE_PAYLOAD)).get('/test');
    expect(res.body.name).toBe(SENSITIVE_PAYLOAD.name);
    expect(res.body.ssn).toBeUndefined();
    expect(res.body.policyNumber).toBeUndefined();
  });

  it('filters nested objects', async () => {
    const nested = { patient: { ssn: '000', name: 'Bob' } };
    const res = await request(makeApp('READ_ONLY', nested)).get('/test');
    expect(res.body.patient.name).toBe('Bob');
    expect(res.body.patient.ssn).toBeUndefined();
  });

  it('filters arrays of objects', async () => {
    const arr = { items: [{ ssn: '111', name: 'A' }, { ssn: '222', name: 'B' }] };
    const res = await request(makeApp('READ_ONLY', arr)).get('/test');
    expect(res.body.items[0].name).toBe('A');
    expect(res.body.items[0].ssn).toBeUndefined();
  });

  it('passes through response unchanged when no user is set', async () => {
    const res = await request(makeApp(undefined, SENSITIVE_PAYLOAD)).get('/test');
    // No role — middleware skips filtering (auth middleware handles 401)
    expect(res.body).toMatchObject(SENSITIVE_PAYLOAD);
  });
});
