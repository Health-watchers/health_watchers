import express from 'express';
import request from 'supertest';
import { cspReportRoutes } from './csp-report.controller';

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('cspReportRoutes', () => {
  const app = express();
  app.use('/api/v1/csp-report', cspReportRoutes);

  it('accepts a browser-generated CSP violation report and returns 204', async () => {
    const res = await request(app)
      .post('/api/v1/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://app.healthwatchers.example/patients',
            'violated-directive': "script-src 'self'",
            'blocked-uri': 'https://evil.example/x.js',
          },
        })
      );

    expect(res.status).toBe(204);
  });

  it('accepts a report sent as application/json and returns 204', async () => {
    const res = await request(app)
      .post('/api/v1/csp-report')
      .send({ 'csp-report': { 'violated-directive': "default-src 'self'" } });

    expect(res.status).toBe(204);
  });

  it('does not require authentication or a CSRF token', async () => {
    // No Authorization header and no X-CSRF-Token — must still succeed, since browsers
    // send violation reports with no user session and this route is CSRF-exempt.
    const res = await request(app)
      .post('/api/v1/csp-report')
      .send({ 'csp-report': { 'blocked-uri': 'inline' } });

    expect(res.status).toBe(204);
  });
});
