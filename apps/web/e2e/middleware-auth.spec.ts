/**
 * E2E tests for the unified middleware (apps/web/src/middleware.ts).
 *
 * These tests run against a live Next.js dev/preview server and verify the
 * three acceptance-criteria cases from issue #1808:
 *
 *  1. An unauthenticated user visiting a staff-protected route is redirected
 *     to /login (not served the page).
 *  2. A DOCTOR (non-admin) visiting an admin-only path (/settings/staff) is
 *     answered with a 403 / forbidden page.
 *  3. A portal user (portalAccessToken cookie, no accessToken cookie) visiting
 *     a staff route is redirected to /login.
 *
 * Additional cases:
 *  4. /not-me is reachable without any auth cookie.
 *  5. A portal user visiting a blocked admin deep-link is redirected to
 *     /portal/dashboard.
 *  6. An authenticated staff user on /login is redirected to home.
 *  7. The locale cookie is set on the first unauthenticated request.
 *
 * Token generation
 * ─────────────────
 * The helpers below build minimal, unsigned JWTs that carry only the claims
 * the middleware actually reads (role, onboardingCompleted).  The middleware
 * never verifies signatures — it delegates that to the API — so unsigned
 * tokens are sufficient for routing tests.
 *
 * Environment variables (fall back to usable defaults):
 *   PLAYWRIGHT_BASE_URL — base URL of the Next.js server (default: http://localhost:3000)
 */

import { test, expect, type BrowserContext } from '@playwright/test';

// ── JWT helpers ───────────────────────────────────────────────────────────────

/**
 * Build a minimal, unsigned JWT (header.payload.signature) containing
 * only the claims needed for middleware routing decisions.
 */
function buildFakeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ ...payload, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${header}.${body}.fakesig`;
}

const DOCTOR_TOKEN = buildFakeJwt({ role: 'DOCTOR', onboardingCompleted: true });
const ADMIN_TOKEN = buildFakeJwt({ role: 'CLINIC_ADMIN', onboardingCompleted: true });
const PORTAL_TOKEN = buildFakeJwt({ sub: 'patient-1' });

// ── Context helpers ───────────────────────────────────────────────────────────

/** Set the accessToken cookie as a staff user with the given JWT. */
async function setStaffCookie(context: BrowserContext, jwt: string) {
  await context.addCookies([
    {
      name: 'accessToken',
      value: jwt,
      domain: 'localhost',
      path: '/',
      httpOnly: false, // test-only: Playwright cannot set httpOnly via addCookies
      sameSite: 'Lax',
    },
  ]);
}

/** Set the portalAccessToken cookie as a portal (patient) user. */
async function setPortalCookie(context: BrowserContext, jwt: string) {
  await context.addCookies([
    {
      name: 'portalAccessToken',
      value: jwt,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
}

/** Clear all auth cookies from the context. */
async function clearAuthCookies(context: BrowserContext) {
  await context.clearCookies();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Middleware auth routing', () => {
  // ── 1. Unauthenticated → staff protected route ──────────────────────────────
  test.describe('unauthenticated user', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
    });

    test('visiting /patients redirects to /login', async ({ page }) => {
      await page.goto('/patients');
      await expect(page).toHaveURL(/\/login/);
    });

    test('visiting /encounters redirects to /login', async ({ page }) => {
      await page.goto('/encounters');
      await expect(page).toHaveURL(/\/login/);
    });

    test('visiting /settings redirects to /login', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/login/);
    });

    test('visiting /wallet redirects to /login', async ({ page }) => {
      await page.goto('/wallet');
      await expect(page).toHaveURL(/\/login/);
    });

    test('redirect URL carries a returnTo param pointing at the original path', async ({
      page,
    }) => {
      await page.goto('/patients');
      const url = new URL(page.url());
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.get('returnTo')).toBe('/patients');
    });

    test('/not-me is accessible without any auth cookie', async ({ page }) => {
      const response = await page.goto('/not-me');
      // Should not redirect to /login
      expect(page.url()).not.toMatch(/\/login/);
      // Response must be 2xx (200) or the page loads normally
      expect(response?.status()).toBeLessThan(400);
    });

    test('locale cookie is set on first visit to /login', async ({ page }) => {
      await page.goto('/login');
      const cookies = await page.context().cookies();
      const locale = cookies.find((c) => c.name === 'locale');
      expect(locale).toBeDefined();
      expect(['en', 'fr', 'pt', 'yo', 'ha']).toContain(locale?.value);
    });
  });

  // ── 2. DOCTOR (non-admin) visiting an admin-only path ───────────────────────
  test.describe('DOCTOR role visiting admin paths', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
      await setStaffCookie(context, DOCTOR_TOKEN);
    });

    test('visiting /settings/staff returns a 403 / forbidden response', async ({ page }) => {
      const response = await page.goto('/settings/staff');
      // The middleware rewrites to /forbidden with status 403
      expect(response?.status()).toBe(403);
    });

    test('visiting /settings redirects home (not 403)', async ({ page }) => {
      await page.goto('/settings');
      // Non-forbidden admin path: should redirect to / rather than 403
      await expect(page).not.toHaveURL(/\/settings/);
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('visiting /reports redirects home', async ({ page }) => {
      await page.goto('/reports');
      await expect(page).not.toHaveURL(/\/reports/);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 3. Portal user visiting staff routes ────────────────────────────────────
  test.describe('portal user visiting staff routes', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
      await setPortalCookie(context, PORTAL_TOKEN);
    });

    test('visiting /patients redirects to /login', async ({ page }) => {
      await page.goto('/patients');
      await expect(page).toHaveURL(/\/login/);
    });

    test('visiting /settings redirects to /login', async ({ page }) => {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/login/);
    });

    test('visiting /encounters redirects to /login', async ({ page }) => {
      await page.goto('/encounters');
      await expect(page).toHaveURL(/\/login/);
    });
  });

  // ── 4. Portal user visiting blocked admin deep-links ────────────────────────
  test.describe('portal user visiting portal admin deep-links', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
      await setPortalCookie(context, PORTAL_TOKEN);
    });

    test('visiting /portal/patients redirects to /portal/dashboard', async ({ page }) => {
      await page.goto('/portal/patients');
      await expect(page).toHaveURL(/\/portal\/dashboard/);
    });

    test('visiting /portal/users redirects to /portal/dashboard', async ({ page }) => {
      await page.goto('/portal/users');
      await expect(page).toHaveURL(/\/portal\/dashboard/);
    });

    test('visiting /portal/billing redirects to /portal/dashboard', async ({ page }) => {
      await page.goto('/portal/billing');
      await expect(page).toHaveURL(/\/portal\/dashboard/);
    });
  });

  // ── 5. Authenticated staff on /login → redirect home ────────────────────────
  test.describe('authenticated staff user visiting /login', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
      await setStaffCookie(context, DOCTOR_TOKEN);
    });

    test('is redirected away from /login to home', async ({ page }) => {
      await page.goto('/login');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 6. CLINIC_ADMIN can access admin paths ───────────────────────────────────
  test.describe('CLINIC_ADMIN visiting admin paths', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
      await setStaffCookie(context, ADMIN_TOKEN);
    });

    test('can reach /settings without being redirected', async ({ page }) => {
      await page.goto('/settings');
      // Should NOT redirect to /login or /forbidden
      await expect(page).not.toHaveURL(/\/login/);
      const response = await page.goto('/settings');
      expect(response?.status()).not.toBe(403);
    });
  });

  // ── 7. Portal unauthenticated → portal login ────────────────────────────────
  test.describe('unauthenticated portal visitor', () => {
    test.beforeEach(async ({ context }) => {
      await clearAuthCookies(context);
    });

    test('visiting /portal/dashboard redirects to /portal/login', async ({ page }) => {
      await page.goto('/portal/dashboard');
      await expect(page).toHaveURL(/\/portal\/login/);
    });

    test('redirect carries a returnTo param', async ({ page }) => {
      await page.goto('/portal/dashboard');
      const url = new URL(page.url());
      expect(url.searchParams.get('returnTo')).toBe('/portal/dashboard');
    });
  });
});
