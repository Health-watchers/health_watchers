/**
 * Visual Regression — Cross-browser and responsive design tests.
 *
 * These tests verify that the UI renders consistently across different browsers
 * and screen sizes (desktop / tablet / mobile breakpoints).
 *
 * They intentionally cycle through multiple viewport sizes within a single
 * test to keep the snapshot count manageable while still covering the
 * most important breakpoints.
 *
 * Cross-browser validation is handled by running these tests under the
 * `chromium-*`, `firefox-*`, and `webkit-*` projects in playwright.visual.config.ts.
 */

import { test, expect } from '@playwright/test';
import {
  loginAs,
  setDarkMode,
  setLightMode,
  waitForPageStable,
  disableAnimations,
  getDynamicMasks,
} from './helpers';
import { cycleViewports } from './mobile-helpers';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

const RESPONSIVE_VIEWPORTS = [
  { width: 1280, height: 800, label: 'desktop-1280' },
  { width: 1024, height: 768, label: 'laptop-1024' },
  { width: 768, height: 1024, label: 'tablet-768' },
  { width: 375, height: 812, label: 'mobile-375' },
] as const;

// ---------------------------------------------------------------------------
// Navigation / shell — verifies that Sidebar / TopBar / mobile drawer adapt
// ---------------------------------------------------------------------------

test.describe('Navigation responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await page.goto('/');
    await waitForPageStable(page);
  });

  test('sidebar collapses correctly at each breakpoint', async ({ page }) => {
    await disableAnimations(page);

    await cycleViewports(page, [...RESPONSIVE_VIEWPORTS], async (vp) => {
      await waitForPageStable(page);
      await expect(page).toHaveScreenshot(`nav-${vp.label}.png`, {
        fullPage: false,
        // Only capture the top-left shell area (nav + header)
        clip: { x: 0, y: 0, width: vp.width, height: 80 },
        mask: getDynamicMasks(page),
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Key content pages at every breakpoint
// ---------------------------------------------------------------------------

test.describe('Responsive — patients list', () => {
  test.beforeEach(async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('patients list across viewports', async ({ page }) => {
    await page.goto('/patients');
    await waitForPageStable(page);
    await disableAnimations(page);

    await cycleViewports(page, [...RESPONSIVE_VIEWPORTS], async (vp) => {
      await waitForPageStable(page);
      await expect(page).toHaveScreenshot(`patients-${vp.label}.png`, {
        fullPage: true,
        mask: getDynamicMasks(page),
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    });
  });
});

test.describe('Responsive — appointments', () => {
  test.beforeEach(async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('appointments across viewports', async ({ page }) => {
    await page.goto('/appointments');
    await waitForPageStable(page);
    await disableAnimations(page);

    await cycleViewports(page, [...RESPONSIVE_VIEWPORTS], async (vp) => {
      await waitForPageStable(page);
      await expect(page).toHaveScreenshot(`appointments-${vp.label}.png`, {
        fullPage: true,
        mask: getDynamicMasks(page),
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    });
  });
});

test.describe('Responsive — settings', () => {
  test.beforeEach(async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('settings page across viewports', async ({ page }) => {
    await page.goto('/settings');
    await waitForPageStable(page);
    await disableAnimations(page);

    await cycleViewports(page, [...RESPONSIVE_VIEWPORTS], async (vp) => {
      await waitForPageStable(page);
      await expect(page).toHaveScreenshot(`settings-${vp.label}.png`, {
        fullPage: true,
        mask: getDynamicMasks(page),
        maxDiffPixelRatio: 0.005,
        animations: 'disabled',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-browser render consistency — compare snapshots across projects
// (Playwright handles this automatically; the test just needs to run in
// all browser projects to generate the per-browser baseline files)
// ---------------------------------------------------------------------------

test.describe('Cross-browser — key components', () => {
  test.beforeEach(async ({ page }) => {
    const colorScheme = test.info().project.use.colorScheme;
    if (colorScheme === 'dark') await setDarkMode(page); else await setLightMode(page);
    await loginAs(page, DOCTOR_EMAIL, DOCTOR_PASSWORD);
  });

  test('payment form renders correctly', async ({ page }) => {
    await page.goto('/payments');
    await waitForPageStable(page);
    await disableAnimations(page);
    await expect(page).toHaveScreenshot('payments-cross-browser.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.01, // slightly more tolerance for cross-browser fonts
      animations: 'disabled',
    });
  });

  test('dashboard widgets render correctly', async ({ page }) => {
    await page.goto('/');
    await waitForPageStable(page);
    await disableAnimations(page);
    await expect(page).toHaveScreenshot('dashboard-cross-browser.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });

  test('login page renders consistently', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in/i }).waitFor();
    await disableAnimations(page);
    await expect(page).toHaveScreenshot('login-cross-browser.png', {
      fullPage: true,
      mask: getDynamicMasks(page),
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    });
  });
});
