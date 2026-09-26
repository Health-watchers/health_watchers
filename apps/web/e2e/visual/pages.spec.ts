/**
 * Visual Regression — Baseline screenshot tests for all major pages.
 *
 * These tests are the primary baseline for the visual regression suite.
 * They cover every major route in the application and run under every
 * browser × viewport × theme project defined in playwright.visual.config.ts.
 *
 * Snapshot storage:
 *   e2e/snapshots/<project>/<file>/<snapshot-name>.png
 *
 * Regenerate baselines after intentional UI changes:
 *   npx playwright test --config=playwright.visual.config.ts --update-snapshots
 */

import { test } from '@playwright/test';
import {
  loginAs,
  setDarkMode,
  setLightMode,
  takeStableScreenshot,
} from './helpers';

// ---------------------------------------------------------------------------
// Credentials (injected by CI secrets or local .env)
// ---------------------------------------------------------------------------
const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

// ---------------------------------------------------------------------------
// Public / unauthenticated pages
// ---------------------------------------------------------------------------

test.describe('Public pages', () => {
  test('login page', async ({ page }) => {
    // Theme is controlled by the project's colorScheme; we also set localStorage
    // so next-themes picks up the right class even on initial load.
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);

    await page.goto('/login');
    await page.getByRole('button', { name: /sign in/i }).waitFor();

    await takeStableScreenshot(page, 'login.png');
  });

  test('register page', async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);

    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await takeStableScreenshot(page, 'register.png');
  });

  test('forgot-password page', async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);

    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');
    await takeStableScreenshot(page, 'forgot-password.png');
  });
});

// ---------------------------------------------------------------------------
// Authenticated pages — shared login
// ---------------------------------------------------------------------------

test.describe('Authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);

    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  // ── Dashboard ─────────────────────────────────────────────────────────────
  test('dashboard', async ({ page }) => {
    await page.goto('/');
    await takeStableScreenshot(page, 'dashboard.png');
  });

  // ── Patients ──────────────────────────────────────────────────────────────
  test('patients list', async ({ page }) => {
    await page.goto('/patients');
    await takeStableScreenshot(page, 'patients-list.png');
  });

  test('new patient form', async ({ page }) => {
    await page.goto('/patients/new');
    await takeStableScreenshot(page, 'patients-new.png');
  });

  // ── Appointments ──────────────────────────────────────────────────────────
  test('appointments', async ({ page }) => {
    await page.goto('/appointments');
    await takeStableScreenshot(page, 'appointments.png');
  });

  // ── Encounters ────────────────────────────────────────────────────────────
  test('encounters list', async ({ page }) => {
    await page.goto('/encounters');
    await takeStableScreenshot(page, 'encounters-list.png');
  });

  test('new encounter form', async ({ page }) => {
    await page.goto('/encounters/new');
    await takeStableScreenshot(page, 'encounters-new.png');
  });

  // ── Payments ──────────────────────────────────────────────────────────────
  test('payments', async ({ page }) => {
    await page.goto('/payments');
    await takeStableScreenshot(page, 'payments.png');
  });

  test('payment analytics', async ({ page }) => {
    await page.goto('/payments/analytics');
    await takeStableScreenshot(page, 'payments-analytics.png');
  });

  // ── Wallet ────────────────────────────────────────────────────────────────
  test('wallet', async ({ page }) => {
    await page.goto('/wallet');
    await takeStableScreenshot(page, 'wallet.png');
  });

  // ── Invoices ──────────────────────────────────────────────────────────────
  test('invoices', async ({ page }) => {
    await page.goto('/invoices');
    await takeStableScreenshot(page, 'invoices.png');
  });

  // ── Reports ───────────────────────────────────────────────────────────────
  test('reports', async ({ page }) => {
    await page.goto('/reports');
    await takeStableScreenshot(page, 'reports.png');
  });

  // ── CDS ───────────────────────────────────────────────────────────────────
  test('CDS recommendations', async ({ page }) => {
    await page.goto('/cds');
    await takeStableScreenshot(page, 'cds.png');
  });

  // ── Referrals ─────────────────────────────────────────────────────────────
  test('referrals', async ({ page }) => {
    await page.goto('/referrals');
    await takeStableScreenshot(page, 'referrals.png');
  });

  // ── Immunizations ─────────────────────────────────────────────────────────
  test('immunizations', async ({ page }) => {
    await page.goto('/immunizations');
    await takeStableScreenshot(page, 'immunizations.png');
  });

  // ── Settings ──────────────────────────────────────────────────────────────
  test('settings', async ({ page }) => {
    await page.goto('/settings');
    await takeStableScreenshot(page, 'settings.png');
  });

  // ── Disputes ──────────────────────────────────────────────────────────────
  test('disputes', async ({ page }) => {
    await page.goto('/disputes');
    await takeStableScreenshot(page, 'disputes.png');
  });
});

// ---------------------------------------------------------------------------
// Patient portal pages (separate auth flow)
// ---------------------------------------------------------------------------

test.describe('Patient portal pages', () => {
  test('portal login', async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);

    await page.goto('/portal/login');
    await page.waitForLoadState('networkidle');
    await takeStableScreenshot(page, 'portal-login.png');
  });
});
