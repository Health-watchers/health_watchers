import { test, expect } from '@playwright/test';

test.describe('Comprehensive Security Headers', () => {
  test('web responses include all HIPAA-required security headers', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();

    // Content Security Policy
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain('report-uri');

    // Clickjacking Protection
    expect(headers['x-frame-options']).toBe('DENY');

    // HTTPS Enforcement (HSTS)
    expect(headers['strict-transport-security']).toBeDefined();
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['strict-transport-security']).toContain('includeSubDomains');

    // MIME Type Sniffing Protection
    expect(headers['x-content-type-options']).toBe('nosniff');

    // Permissions Policy (formerly Feature-Policy)
    expect(headers['permissions-policy']).toBeDefined();
    expect(headers['permissions-policy']).toMatch(/geolocation=\(\)|camera=\(\)|microphone=\(\)/);

    // Referrer Policy
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('CSP is strict: no unsafe-inline/unsafe-eval, nonce + strict-dynamic + report-uri', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const csp = response!.headers()['content-security-policy'];
    expect(csp).toBeDefined();

    // Strict policy must not weaken script execution
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");

    // script-src must use a nonce and strict-dynamic
    const scriptSrc = csp
      .split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
    expect(scriptSrc).toContain("'strict-dynamic'");

    // Violations must be reported
    expect(csp).toContain('report-uri');
  });

  test('CSP nonce is present and changes per request', async ({ page }) => {
    const extractNonce = (csp: string | undefined): string | undefined => {
      if (!csp) return undefined;
      const match = csp.match(/'nonce-([A-Za-z0-9+/=_-]+)'/);
      return match ? match[1] : undefined;
    };

    const firstResponse = await page.goto('/');
    expect(firstResponse).not.toBeNull();
    const firstNonce = extractNonce(firstResponse!.headers()['content-security-policy']);
    expect(firstNonce).toBeDefined();

    const secondResponse = await page.goto('/');
    expect(secondResponse).not.toBeNull();
    const secondNonce = extractNonce(secondResponse!.headers()['content-security-policy']);
    expect(secondNonce).toBeDefined();

    // Nonce must be unique per request to prevent reuse
    expect(secondNonce).not.toBe(firstNonce);
  });

  test('CSP blocks inline scripts without the nonce', async ({ page }) => {
    // Track CSP violations
    const cspViolations: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Content Security Policy') || text.includes('CSP')) {
        cspViolations.push(text);
      }
    });

    // Navigate to app
    await page.goto('/');

    // Attempt to inject inline script without a nonce (should be blocked by CSP)
    await page.evaluate(() => {
      try {
        const script = document.createElement('script');
        script.textContent = 'window.__dangerousScriptExecuted = true;';
        document.body.appendChild(script);
      } catch (e) {
        console.error('CSP blocked inline script:', e);
      }
    });

    // Give the browser time to process the (blocked) script and emit a report
    await page.waitForTimeout(1000);

    // Verify the inline script did not execute
    const dangerousScriptRan = await page.evaluate(() => {
      return (window as any).__dangerousScriptExecuted === true;
    });

    expect(dangerousScriptRan).toBeFalsy();

    // A CSP violation should have been reported for the blocked inline script
    expect(cspViolations.length).toBeGreaterThan(0);
  });

  test('security headers are present on error pages', async ({ page }) => {
    const response = await page.goto('/non-existent-page-404');

    if (response) {
      const headers = response.headers();
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['content-security-policy']).toBeDefined();
    }
  });

  test('security headers are present on API proxy responses', async ({ page, request }) => {
    // Make a request that goes through the Next.js API routes
    const response = await request.get('/api/health');

    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeDefined();
  });
});

test.describe('API Security Headers', () => {
  test('API returns X-Request-ID on all responses', async ({ request }) => {
    const response = await request.get('http://localhost:3001/api/v1/health');

    expect(response.headers()['x-request-id']).toBeDefined();
    expect(response.headers()['x-request-id']).toMatch(/^[a-f0-9-]{36}$/); // UUID format
  });

  test('API returns security headers on error responses', async ({ request }) => {
    const response = await request.get('http://localhost:3001/api/v1/nonexistent-endpoint');

    expect(response.status()).toBe(404);
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBeDefined();
  });

  test('CORS headers restrict origins to expected frontend URL', async ({ request }) => {
    // Allowed origin
    const allowedResponse = await request.get('http://localhost:3001/api/v1/health', {
      headers: {
        'Origin': 'http://localhost:3000'
      }
    });

    expect(allowedResponse.headers()['access-control-allow-origin']).toBeDefined();
    expect(allowedResponse.headers()['access-control-allow-credentials']).toBe('true');

    // Blocked origin
    const blockedResponse = await request.get('http://localhost:3001/api/v1/health', {
      headers: {
        'Origin': 'https://evil-site.com'
      }
    });

    // Either no CORS header or explicit block
    const corsHeader = blockedResponse.headers()['access-control-allow-origin'];
    if (corsHeader) {
      expect(corsHeader).not.toBe('https://evil-site.com');
    }
  });

  test('API includes cache-control headers for sensitive endpoints', async ({ request }) => {
    // Auth endpoints should not be cached
    const response = await request.post('http://localhost:3001/api/v1/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });

    const cacheControl = response.headers()['cache-control'];
    expect(cacheControl).toBeDefined();
    expect(cacheControl).toMatch(/no-store|no-cache|private/);
  });
});

