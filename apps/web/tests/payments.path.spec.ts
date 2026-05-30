import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Path payment UI', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@clinic.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  test('selects a path and creates a payment intent', async ({ page }) => {
    await page.goto(`${BASE_URL}/payments`);
    await page.click('button:has-text("+ New Payment")');
    await page.waitForSelector('[role="dialog"]');

    // Fill form
    await page.fill('input[placeholder="0.00"]', '10.00');
    // Choose receive asset (USDC) if available
    const receiveSelect = page.locator('label:has-text("Receive Asset")').first();
    if (await receiveSelect.count()) {
      await page.click('label:has-text("Receive Asset")');
      await page.click('text=USDC');
    }

    // Choose pay with asset different than destination
    await page.click('label:has-text("Pay with Asset")');
    await page.click('text=XLM');

    // Wait for paths to appear
    await page.waitForSelector('text=Available Paths', { timeout: 5000 });

    // Select first available path
    const firstRadio = page.locator('input[name="selectedPath"]').first();
    if (await firstRadio.isVisible()) {
      await firstRadio.check();
    }

    // Submit
    await page.click('button:has-text("Create Payment Intent")');

    // Expect success toast
    await page.waitForSelector('text=Payment intent created.', { timeout: 5000 });
    const toast = await page.locator('text=Payment intent created.').count();
    expect(toast).toBeGreaterThan(0);
  });
});
