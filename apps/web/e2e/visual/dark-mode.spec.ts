/**
 * Visual Regression — Dark mode screenshot tests.
 *
 * Verifies that:
 *   1. The dark theme is applied correctly (html.dark class + CSS custom properties).
 *   2. All major pages look correct in dark mode.
 *   3. The theme toggle is visually consistent in both states.
 *   4. Dark mode is stable on mobile viewports.
 *
 * These tests run in parallel with light-mode tests under the *-dark projects
 * in playwright.visual.config.ts.  To run only dark-mode tests locally:
 *
 *   npx playwright test --config=playwright.visual.config.ts \
 *     --project chromium-desktop-dark e2e/visual/dark-mode.spec.ts
 */

import { test, expect } from '@playwright/test';
import {
  loginAs,
  setDarkMode,
  waitForPageStable,
  disableAnimations,
  getDynamicMasks,
} from './helpers';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that the <html> element carries the `dark` class (applied by
 * next-themes when dark mode is active).
 */
async function assertDarkClass(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('html')).toHaveClass(/dark/, { timeout: 5_000 });
}

// ---------------------------------------------------------------------------
// Public pages — dark mode
// ---------------------------------------------------------------------------

test.describe('Dark mode — public pages', () => {
  test.beforeEach(async ({ page }) => {
    await setDarkMode(page);
  });

  test('login page dark', async ({ page }) => {
    await page.goto('/login');
    await assertDarkClass(page);
    await page.getByRole('button', { name: /sign in/i }).waitFor();
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('login-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('register page dark', async ({ page }) => {
    await page.goto('/register');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('register-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('forgot-password page dark', async ({ page }) => {
    await page.goto('/forgot-password');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('forgot-password-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });
});

// ---------------------------------------------------------------------------
// Authenticated pages — dark mode
// ---------------------------------------------------------------------------

test.describe('Dark mode — authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    await setDarkMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('dashboard dark', async ({ page }) => {
    await page.goto('/');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('dashboard-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('patients list dark', async ({ page }) => {
    await page.goto('/patients');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('patients-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('appointments dark', async ({ page }) => {
    await page.goto('/appointments');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('appointments-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('encounters dark', async ({ page }) => {
    await page.goto('/encounters');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('encounters-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('payments dark', async ({ page }) => {
    await page.goto('/payments');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('payments-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('wallet dark', async ({ page }) => {
    await page.goto('/wallet');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('wallet-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('portal dark', async ({ page }) => {
    await page.goto('/portal');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('portal-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('portal appointments dark', async ({ page }) => {
    await page.goto('/portal/appointments');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('portal-appointments-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('portal records dark', async ({ page }) => {
    await page.goto('/portal/records');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('portal-records-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('portal payments dark', async ({ page }) => {
    await page.goto('/portal/payments');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('portal-payments-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('settings dark', async ({ page }) => {
    await page.goto('/settings');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('settings-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('reports dark', async ({ page }) => {
    await page.goto('/reports');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('reports-dark.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  // ── Theme toggle visual state ─────────────────────────────────────────────
  test('theme toggle renders correctly in dark mode', async ({ page }) => {
    await page.goto('/');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    // Capture just the TopBar area where the theme toggle lives
    const topBar = page.locator('[data-testid="top-bar"], header').first();
    await expect(topBar).toHaveScreenshot('topbar-dark-toggle.png', {
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });
});

// ---------------------------------------------------------------------------
// Dark mode — mobile viewports
// ---------------------------------------------------------------------------

test.describe('Dark mode — mobile viewport', () => {
  test.beforeEach(async ({ page }) => {
    await setDarkMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('dashboard dark mobile', async ({ page }) => {
    // Resize to mobile width to verify responsive dark layout
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('dashboard-dark-mobile.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('patients dark mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/patients');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('patients-dark-mobile.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('payments dark mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/payments');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('payments-dark-mobile.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });

  test('encounters dark mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/encounters');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    await expect(page).toHaveScreenshot('encounters-dark-mobile.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
    });
  });
});

// ---------------------------------------------------------------------------
// Dark mode — charts
// ---------------------------------------------------------------------------

test.describe('Dark mode — charts', () => {
  test.beforeEach(async ({ page }) => {
    await setDarkMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('vital signs chart dark', async ({ page }) => {
    await page.goto('/patients');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    // Navigate into the first patient's detail view where the chart renders
    const firstPatient = page.locator('[data-testid="patient-card"], a[href*="/patients/"]').first();
    if (await firstPatient.count()) {
      await firstPatient.click();
      await waitForPageStable(page);
      await disableAnimations(page);

      const chart = page.locator('[data-testid="vital-signs-chart"], .recharts-wrapper').first();
      if (await chart.count()) {
        await expect(chart).toHaveScreenshot('vital-signs-chart-dark.png', {
          maxDiffPixelRatio: 0.005,
          animations: 'disabled',
        });
      }
    }
  });

  test('payment analytics charts dark', async ({ page }) => {
    await page.goto('/reports');
    await assertDarkClass(page);
    await waitForPageStable(page);
    await disableAnimations(page);

    const chart = page.locator('[data-testid="payment-analytics-charts"], .recharts-wrapper').first();
    if (await chart.count()) {
      await expect(chart).toHaveScreenshot('payment-analytics-charts-dark.png', {
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Dark mode — preference persistence
// ---------------------------------------------------------------------------

test.describe('Dark mode — persistence', () => {
  test('theme preference persists across reloads', async ({ page }) => {
    await setDarkMode(page);
    await page.goto('/login');
    await assertDarkClass(page);

    // Reload and confirm the dark class is still applied from persisted storage
    await page.reload();
    await assertDarkClass(page);

    // Preference should be stored in localStorage
    const stored = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      return keys.map((k) => `${k}=${window.localStorage.getItem(k)}`).join(';');
    });
    expect(stored).toMatch(/dark/i);
  });
});
