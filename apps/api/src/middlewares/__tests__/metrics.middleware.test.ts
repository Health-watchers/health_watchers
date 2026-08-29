import { Request, Response } from 'express';
import { metricsMiddleware } from '../metrics.middleware';
import { httpRequestsTotal, securityHeaderViolationsTotal } from '../../services/metrics.service';

function mockRes(overrides: Record<string, unknown> = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const res: any = {
    statusCode: 200,
    getHeader: jest.fn().mockReturnValue(undefined),
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    emit: (event: string) => (listeners[event] || []).forEach((cb) => cb()),
    ...overrides,
  };
  return res as Response & { emit: (e: string) => void };
}

describe('metricsMiddleware', () => {
  it('registers a finish listener and calls next synchronously', () => {
    const req = { method: 'GET', path: '/api/v2/patients', headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    metricsMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('increments httpRequestsTotal when the response finishes', async () => {
    const req = { method: 'GET', path: '/api/v2/test-metrics-unique', headers: {} } as Request;
    const res = mockRes({ statusCode: 200 });
    const next = jest.fn();

    metricsMiddleware(req, res, next);
    res.emit('finish');

    const metric = await httpRequestsTotal.get();
    const match = metric.values.find(
      (v) =>
        v.labels.method === 'GET' &&
        v.labels.path === '/api/v2/test-metrics-unique' &&
        v.labels.status === '200'
    );
    expect(match?.value).toBeGreaterThanOrEqual(1);
  });

  it('records a security header violation for /api paths missing required headers', async () => {
    const req = { method: 'GET', path: '/api/v2/missing-headers-unique', headers: {} } as Request;
    const res = mockRes({ statusCode: 200 });
    const next = jest.fn();

    metricsMiddleware(req, res, next);
    res.emit('finish');

    const metric = await securityHeaderViolationsTotal.get();
    const violation = metric.values.find(
      (v) =>
        v.labels.header === 'content-security-policy' &&
        v.labels.path === '/api/v2/missing-headers-unique'
    );
    expect(violation?.value).toBeGreaterThanOrEqual(1);
  });

  it('does not check security headers for paths outside /api and /health', async () => {
    const req = { method: 'GET', path: '/public/asset-unique.js', headers: {} } as Request;
    const res = mockRes({ statusCode: 200 });
    const next = jest.fn();

    metricsMiddleware(req, res, next);
    res.emit('finish');

    const metric = await securityHeaderViolationsTotal.get();
    const violation = metric.values.find((v) => v.labels.path === '/public/asset-unique.js');
    expect(violation).toBeUndefined();
  });
});
