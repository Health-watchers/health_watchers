import { test, expect } from '@playwright/test';

/**
 * Mobile responsiveness E2E coverage.
 * Runs against the `mobile-ios` (iPhone 13) and `mobile-android` (Pixel 5)
 * Playwright projects configured in playwright.config.ts.
 */

test.describe('Mobile responsiveness', () => {
  test('landing page renders without horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('navigation collapses into a mobile menu', async ({ page }) => {
    await page.goto('/');
    const mobileMenuTrigger = page.getByRole('button', { name: /menu/i });
    await expect(mobileMenuTrigger).toBeVisible();
  });

  test('login form is usable on small viewports', async ({ page }) => {
    await page.goto('/login');
    const emailField = page.getByLabel(/email/i);
    const passwordField = page.getByLabel(/password/i);
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();

    const box = await emailField.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
  });

  test('dashboard cards stack vertically on narrow viewports', async ({ page }) => {
    await page.goto('/dashboard');
    const cards = page.locator('[data-testid="dashboard-card"]');
    const count = await cards.count();
    if (count > 1) {
      const firstBox = await cards.nth(0).boundingBox();
      const secondBox = await cards.nth(1).boundingBox();
      if (firstBox && secondBox) {
        expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y + firstBox.height - 1);
      }
    }
  });

  test('tap targets meet minimum touch size', async ({ page }) => {
    await page.goto('/');
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(24);
      }
    }
  });
});
