/**
 * Mobile screenshot capture helpers.
 *
 * Provides convenience functions for emulating mobile devices and
 * capturing stable full-page screenshots at common mobile form factors.
 *
 * Usage in tests:
 *
 *   import { captureMobileScreenshot, MOBILE_DEVICES } from './mobile-helpers';
 *
 *   test('patients list – iPhone 14', async ({ browser }) => {
 *     const page = await createMobilePage(browser, MOBILE_DEVICES.iphone14);
 *     await loginAs(page);
 *     await page.goto('/patients');
 *     await captureMobileScreenshot(page, 'patients-iphone14.png');
 *     await page.context().close();
 *   });
 */

import { type Browser, type Page, type BrowserContext, expect } from '@playwright/test';
import { waitForPageStable, disableAnimations, getDynamicMasks, loginAs } from './helpers';

// ---------------------------------------------------------------------------
// Device profiles
// ---------------------------------------------------------------------------

export interface MobileDeviceProfile {
  label: string;
  viewport: { width: number; height: number };
  /** CSS pixel ratio (deviceScaleFactor) */
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  userAgent: string;
}

export const MOBILE_DEVICES = {
  iphone14: {
    label: 'iPhone 14',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  iphone14Pro: {
    label: 'iPhone 14 Pro',
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
  pixel7: {
    label: 'Pixel 7',
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
  },
  galaxyS23: {
    label: 'Samsung Galaxy S23',
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  },
  ipadPro: {
    label: 'iPad Pro 11"',
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  },
} satisfies Record<string, MobileDeviceProfile>;

// ---------------------------------------------------------------------------
// Page factory
// ---------------------------------------------------------------------------

/**
 * Create a new browser context + page with the given mobile device profile.
 * Caller is responsible for closing the context when done.
 */
export async function createMobilePage(
  browser: Browser,
  device: MobileDeviceProfile,
  options?: { darkMode?: boolean },
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    userAgent: device.userAgent,
    colorScheme: options?.darkMode ? 'dark' : 'light',
  });

  if (options?.darkMode) {
    // Inject localStorage theme before any navigation
    await context.addInitScript(() => {
      window.localStorage.setItem('theme', 'dark');
    });
  }

  const page = await context.newPage();
  return { page, context };
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a URL on a pre-configured mobile page and capture a full-page
 * screenshot. The page is automatically logged in before navigation.
 */
export async function captureMobilePageScreenshot(
  page: Page,
  url: string,
  snapshotName: string,
  options?: {
    maxDiffPixelRatio?: number;
    skipLogin?: boolean;
  },
): Promise<void> {
  if (!options?.skipLogin) {
    await loginAs(page);
  }

  await page.goto(url);
  await captureMobileScreenshot(page, snapshotName, options);
}

/**
 * Capture a stable full-page screenshot of the current mobile page state.
 */
export async function captureMobileScreenshot(
  page: Page,
  snapshotName: string,
  options?: { maxDiffPixelRatio?: number },
): Promise<void> {
  await waitForPageStable(page);
  await disableAnimations(page);

  await expect(page).toHaveScreenshot(snapshotName, {
    fullPage: true,
    mask: getDynamicMasks(page),
    maxDiffPixelRatio: options?.maxDiffPixelRatio ?? 0.005,
    threshold: 0.2,
    animations: 'disabled',
  });
}

// ---------------------------------------------------------------------------
// Viewport-cycle helper
// ---------------------------------------------------------------------------

/**
 * Given a list of viewports, resizes the page to each one and calls the
 * provided callback. Useful for testing responsive breakpoints within a
 * single test without spinning up separate projects.
 *
 * @example
 * await cycleViewports(page, [
 *   { width: 1280, height: 800, label: 'desktop' },
 *   { width: 768, height: 1024, label: 'tablet' },
 *   { width: 390, height: 844, label: 'mobile' },
 * ], async (vp) => {
 *   await expect(page).toHaveScreenshot(`patients-${vp.label}.png`);
 * });
 */
export async function cycleViewports(
  page: Page,
  viewports: Array<{ width: number; height: number; label: string }>,
  callback: (viewport: { width: number; height: number; label: string }) => Promise<void>,
): Promise<void> {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // Short pause to let responsive layout re-render
    await page.waitForTimeout(150);
    await callback(vp);
  }
}
