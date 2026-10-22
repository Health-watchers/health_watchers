/**
 * Visual regression tests using Playwright's built-in screenshot comparison
 * (`toHaveScreenshot` — Playwright's equivalent of Jest's `toMatchSnapshot`).
 *
 * Baseline screenshots are stored in version control at:
 *   apps/web/e2e/visual-regression.spec.ts-snapshots/
 *
 * Tolerance threshold:
 *   - maxDiffPixelRatio 0.02 → up to 2% of pixels may differ (anti-alias noise)
 *   - threshold 0.2         → per-pixel colour channel drift tolerated (0–1)
 *   - animations disabled   → freeze transitions so frames are deterministic
 *
 * Coverage: login page, dashboard, patient detail, encounter form, payment table
 * (plus the patients list, appointments, and encounters list views).
 *
 * To regenerate baselines after an intentional UI change:
 *   npm run test:visual:gate:update --workspace=web
 * Review the diffs, commit the updated baselines, and push.
 * See e2e/VISUAL_REGRESSION.md for the full workflow.
 */
import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';
/**
 * A patient id present in the seeded DB. When unset, the patient-detail test
 * falls back to opening the patients list and following the first patient link
 * — the same approach used by the encounter-creation e2e flow.
 */
const TEST_PATIENT_ID = process.env.E2E_TEST_PATIENT_ID ?? '';

/**
 * Shared snapshot options applied to every baseline comparison.
 */
const SNAPSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.02, // allow up to 2% pixel difference for anti-aliasing
  threshold: 0.2, // per-pixel colour channel tolerance (0–1)
  animations: 'disabled' as const,
} as const;

/**
 * Navigate to a patient's detail page. Uses the seeded patient id when
 * available (E2E_TEST_PATIENT_ID); otherwise opens the patients list and
 * follows the first patient link. Waits for the record to load before
 * returning so callers don't snapshot a loading state.
 */
async function gotoPatientDetail(page: Page): Promise<void> {
  if (TEST_PATIENT_ID) {
    await page.goto(`/patients/${TEST_PATIENT_ID}`);
  } else {
    await page.goto('/patients');
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: /view/i }).first().click();
  }
  await page.waitForLoadState('networkidle');
  await expect(
    page.getByRole('button', { name: /new encounter/i }),
  ).toBeVisible();
}

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

  test('patient detail', async ({ page }) => {
    await gotoPatientDetail(page);
    await expect(page).toHaveScreenshot('patient-detail.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });

  test('encounter form', async ({ page }) => {
    await page.goto('/encounters/new');
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByRole('heading', { name: /new encounter/i }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('encounter-form.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });

  test('payment table', async ({ page }) => {
    await page.goto('/payments');
    await page.waitForLoadState('networkidle');
    // Wait for the loading skeleton to clear so we snapshot settled content
    await expect(page.getByRole('tab', { name: /payments/i })).toBeVisible();
    await expect(page).toHaveScreenshot('payment-table.png', {
      fullPage: true,
      ...SNAPSHOT_OPTIONS,
    });
  });
});
