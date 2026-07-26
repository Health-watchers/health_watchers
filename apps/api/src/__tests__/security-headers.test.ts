import request from 'supertest';
import app from '../app';

describe('Security headers', () => {
  it('sets Helmet security headers on API responses', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  describe('Content-Security-Policy directives', () => {
    let csp: string;

    beforeAll(async () => {
      const response = await request(app).get('/health');
      csp = response.headers['content-security-policy'] as string;
    });

    it('restricts default-src to self', () => {
      expect(csp).toContain("default-src 'self'");
    });

    it('restricts script-src to self', () => {
      expect(csp).toContain("script-src 'self'");
    });

    it('restricts style-src to self with unsafe-inline', () => {
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('restricts img-src to self and data URIs', () => {
      expect(csp).toContain("img-src 'self' data:");
    });

    it('restricts connect-src to self', () => {
      expect(csp).toContain("connect-src 'self'");
    });

    it('restricts font-src to self', () => {
      expect(csp).toContain("font-src 'self'");
    });

    it('blocks object-src entirely', () => {
      expect(csp).toContain("object-src 'none'");
    });

    it('blocks frame embedding via frame-ancestors', () => {
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('includes report-uri for violation reporting', () => {
      expect(csp).toContain('report-uri /api/v1/csp-report');
    });
  });

  describe('HSTS header', () => {
    let hsts: string;

    beforeAll(async () => {
      const response = await request(app).get('/health');
      hsts = response.headers['strict-transport-security'] as string;
    });

    it('sets max-age to one year', () => {
      expect(hsts).toContain('max-age=31536000');
    });

    it('includes includeSubDomains', () => {
      expect(hsts).toContain('includeSubDomains');
    });

    it('includes preload', () => {
      expect(hsts).toContain('preload');
    });
  });

  describe('CSP violation reporting endpoint', () => {
    it('accepts CSP reports and returns 204', async () => {
      const report = {
        'csp-report': {
          'document-uri': 'https://example.com/',
          'violated-directive': 'script-src',
          'blocked-uri': 'https://evil.com/script.js',
        },
      };

      const response = await request(app)
        .post('/api/v1/csp-report')
        .set('Content-Type', 'application/csp-report')
        .send(JSON.stringify(report));

      expect(response.status).toBe(204);
    });

    it('accepts JSON-formatted CSP reports', async () => {
      const report = {
        'csp-report': {
          'document-uri': 'https://example.com/',
          'violated-directive': 'img-src',
          'blocked-uri': 'data:',
        },
      };

      const response = await request(app)
        .post('/api/v1/csp-report')
        .set('Content-Type', 'application/json')
        .send(report);

      expect(response.status).toBe(204);
    });
  });
});
