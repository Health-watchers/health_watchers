import { test, expect } from '@playwright/test';

test('web responses include security headers', async ({ page }) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();

  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
});
