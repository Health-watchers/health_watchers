/**
 * Visual regression tests using Playwright's built-in screenshot comparison.
 *
 * Baseline snapshots are stored in apps/web/e2e/visual-regression.spec.ts-snapshots/.
 * To regenerate baselines after an intentional UI change:
 *   npx playwright test visual-regression --update-snapshots
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

const SNAPSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.02, // allow up to 2% pixel difference for anti-aliasing
  animations: 'disabled' as const,
} as const;

test.describe('Visual Regression — Public Pages', () => {
  test('login page — light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page).toHaveScreenshot('login-light.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });

  test('login page — dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    await expect(page).toHaveScreenshot('login-dark.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });
});

test.describe('Visual Regression — Authenticated Pages', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('dashboard — light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    // Wait for async data to settle before snapshotting
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('dashboard-light.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });

  test('patients list page', async ({ page }) => {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('patients-list.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });

  test('appointments page', async ({ page }) => {
    await page.goto('/appointments');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('appointments.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });

  test('encounters page', async ({ page }) => {
    await page.goto('/encounters');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('encounters.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });
});
