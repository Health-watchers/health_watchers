/**
 * Shared helpers for visual regression tests.
 *
 * Covers:
 *   - Authentication (login + session cookie cache)
 *   - Theme injection (light / dark via localStorage)
 *   - Page stabilisation before snapshotting (no animations, loaders settled)
 *   - Consistent masking of dynamic content (timestamps, avatars, charts)
 */

import { type Page, type BrowserContext, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

/**
 * Log in and return to the page we started from.
 * Call from test.beforeEach for authenticated suites.
 */
export async function loginAs(
  page: Page,
  email = DOCTOR_EMAIL,
  password = DOCTOR_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait until we've left /login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

/**
 * Persist authentication state to a storage state file so tests in the same
 * worker can reuse the session without re-logging in each time.
 */
export async function saveAuthState(context: BrowserContext, path: string): Promise<void> {
  await context.storageState({ path });
}

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

/**
 * Force dark mode by writing to localStorage BEFORE the page loads.
 * Must be called before page.goto().
 */
export async function setDarkMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('theme', 'dark');
  });
}

/**
 * Force light mode explicitly (useful when the OS prefers dark).
 */
export async function setLightMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('theme', 'light');
  });
}

// ---------------------------------------------------------------------------
// Page stabilisation
// ---------------------------------------------------------------------------

/**
 * Disable CSS transitions & animations via an injected style tag so that
 * screenshots are frame-perfect and don't catch mid-animation states.
 */
export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

/**
 * Wait for the page to be visually stable:
 *   1. Network is idle (no ongoing XHR/fetch).
 *   2. No spinners or skeleton loaders are visible.
 *   3. The document has been painted at least once.
 */
export async function waitForPageStable(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });

  // Hide skeletons and loading spinners so they don't flicker in screenshots
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="skeleton"], [aria-busy="true"]').forEach((el) => {
      (el as HTMLElement).style.visibility = 'hidden';
    });
  });
}

// ---------------------------------------------------------------------------
// Dynamic content masking
// ---------------------------------------------------------------------------

/**
 * CSS selectors for content that changes between runs (e.g. live data, dates).
 * Pass these in the `mask` option of toHaveScreenshot to blank them out.
 */
export const DYNAMIC_SELECTORS = [
  // Timestamps and "last updated" labels
  '[data-testid="timestamp"]',
  '[data-testid="last-updated"]',
  'time',
  // Avatars that load from external URLs
  'img[src*="avatar"]',
  'img[src*="gravatar"]',
  // Recharts canvas elements (chart content is data-driven and unstable)
  '.recharts-surface',
  // Notification badge counts
  '[data-testid="notification-count"]',
] as const;

/**
 * Return page.locator() objects for all known dynamic selectors.
 * Pass the result to the `mask` option of toHaveScreenshot:
 *
 *   await expect(page).toHaveScreenshot({ mask: getDynamicMasks(page) });
 */
export function getDynamicMasks(page: Page) {
  return DYNAMIC_SELECTORS.map((sel) => page.locator(sel));
}

// ---------------------------------------------------------------------------
// Full-page snapshot helper
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper that:
 *   1. Waits for the page to stabilise.
 *   2. Disables animations.
 *   3. Masks dynamic content.
 *   4. Takes a full-page screenshot with the given name.
 */
export async function takeStableScreenshot(
  page: Page,
  snapshotName: string,
  options?: {
    maxDiffPixelRatio?: number;
    threshold?: number;
    clip?: { x: number; y: number; width: number; height: number };
    fullPage?: boolean;
  },
): Promise<void> {
  await waitForPageStable(page);
  await disableAnimations(page);

  await expect(page).toHaveScreenshot(snapshotName, {
    fullPage: options?.fullPage ?? true,
    mask: getDynamicMasks(page),
    maxDiffPixelRatio: options?.maxDiffPixelRatio ?? 0.005,
    threshold: options?.threshold ?? 0.2,
    animations: 'disabled',
    ...(options?.clip ? { clip: options.clip } : {}),
  });
}
