import { Request, Response } from 'express';

jest.mock('fs');

import fs from 'fs';
import { requestAuditMiddleware } from '../request-audit.middleware';

function flush() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function mockRes(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const res: any = {
    statusCode: 200,
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    emit: (event: string) => (listeners[event] || []).forEach((cb) => cb()),
    ...overrides,
  };
  return res as Response & { emit: (e: string) => void };
}

describe('requestAuditMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next synchronously without waiting for the audit write', () => {
    const req = {
      method: 'GET',
      path: '/api/v2/patients',
      headers: {},
      body: {},
      socket: {},
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    requestAuditMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('writes a redacted audit entry after the response finishes', async () => {
    const req = {
      method: 'POST',
      path: '/api/v2/auth/login',
      headers: { 'x-request-id': 'req-1' },
      body: { email: 'a@b.com', password: 'super-secret' },
      socket: { remoteAddress: '127.0.0.1' },
      user: { userId: 'u1', clinicId: 'c1' },
    } as unknown as Request;
    const res = mockRes({ statusCode: 201 });
    const next = jest.fn();

    requestAuditMiddleware(req, res, next);
    res.emit('finish');
    await flush();

    expect(fs.appendFileSync).toHaveBeenCalled();
    const [, contents] = (fs.appendFileSync as jest.Mock).mock.calls[0];
    const entry = JSON.parse(contents as string);

    expect(entry.method).toBe('POST');
    expect(entry.path).toBe('/api/v2/auth/login');
    expect(entry.status).toBe(201);
    expect(entry.userId).toBe('u1');
    expect(entry.body.email).toBe('a@b.com');
    expect(entry.body.password).toBe('[REDACTED]');
  });

  it('omits the body field when the request body is empty', async () => {
    const req = {
      method: 'GET',
      path: '/api/v2/patients',
      headers: {},
      body: {},
      socket: {},
    } as unknown as Request;
    const res = mockRes();
    const next = jest.fn();

    requestAuditMiddleware(req, res, next);
    res.emit('finish');
    await flush();

    const [, contents] = (fs.appendFileSync as jest.Mock).mock.calls[0];
    const entry = JSON.parse(contents as string);
    expect(entry.body).toBeUndefined();
  });
});
