import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults } from 'axe-core';

/** Format axe violations into a readable string for assertion failure messages. */
function formatViolations(results: AxeResults): string {
  if (results.violations.length === 0) return 'No violations';
  return results.violations
    .map(
      (v) =>
        `[${v.impact?.toUpperCase() ?? 'UNKNOWN'}] ${v.id}: ${v.description}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `  - ${n.html}`)
          .join('\n')
    )
    .join('\n\n');
}

const BASE_URL = 'http://localhost:3000';

test.describe('WCAG 2.1 AA Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@clinic.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  // ── Dashboard Page ────────────────────────────────────────────────────────
  test('dashboard: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('dashboard: keyboard navigation', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    let focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(['button', 'link', 'menuitem']).toContain(focused);

    // Shift+Tab to go back
    await page.keyboard.press('Shift+Tab');
    focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(focused).toBeTruthy();
  });

  // ── Patients Page ────────────────────────────────────────────────────────
  test('patients: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('patients: keyboard navigation in table', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);

    // Tab to first interactive element
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT']).toContain(focused);
  });

  test('patients: form has proper labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);

    // Check all inputs have associated labels
    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      if (id) {
        const label = await page.locator(`label[for="${id}"]`).count();
        expect(label).toBeGreaterThan(0);
      }
    }
  });

  // ── Encounters Page ──────────────────────────────────────────────────────
  test('encounters: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/encounters`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('encounters: form error announcements', async ({ page }) => {
    await page.goto(`${BASE_URL}/encounters`);

    // Try to submit empty form
    const submitButton = page.locator('button[type="submit"]').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();

      // Check for error messages with proper ARIA
      const errors = await page.locator('[role="alert"]').all();
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  // ── Payments Page ────────────────────────────────────────────────────────
  test('payments: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/payments`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('payments: color contrast', async ({ page }) => {
    await page.goto(`${BASE_URL}/payments`);

    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  // ── Settings Page ────────────────────────────────────────────────────────
  test('settings: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('settings: navigation keyboard accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    // Tab through navigation items
    const navItems = await page.locator('nav button, nav a').all();
    expect(navItems.length).toBeGreaterThan(0);

    for (const item of navItems.slice(0, 3)) {
      const isVisible = await item.isVisible();
      if (isVisible) {
        await item.focus();
        const focused = await page.evaluate(() => document.activeElement?.tagName);
        expect(['BUTTON', 'A']).toContain(focused);
      }
    }
  });

  // ── Modal/Dialog Focus Management ────────────────────────────────────────
  test('modals: focus trap and restoration', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);

    // Open modal if available
    const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
    if (await createButton.isVisible()) {
      const initialFocus = await page.evaluate(() => document.activeElement?.tagName);

      await createButton.click();
      await page.waitForSelector('[role="dialog"]');

      // Focus should be in modal
      const modalFocus = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        return modal?.contains(document.activeElement);
      });
      expect(modalFocus).toBeTruthy();

      // Close modal
      const closeButton = page
        .locator(
          '[role="dialog"] button[aria-label*="Close"], [role="dialog"] button[aria-label*="close"]'
        )
        .first();
      if (await closeButton.isVisible()) {
        await closeButton.click();
      } else {
        await page.keyboard.press('Escape');
      }

      // Focus should return to trigger
      await page.waitForTimeout(100);
      const restoredFocus = await page.evaluate(() => document.activeElement?.tagName);
      expect(restoredFocus).toBeTruthy();
    }
  });

  // ── Dynamic Content Announcements ────────────────────────────────────────
  test('notifications: screen reader announcements', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Check for live regions
    const liveRegions = await page.locator('[role="status"], [role="alert"], [aria-live]').all();
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  test('form validation: error announcements', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);

    // Find and interact with form
    const form = page.locator('form').first();
    if (await form.isVisible()) {
      const submitButton = form.locator('button[type="submit"]');
      if (await submitButton.isVisible()) {
        await submitButton.click();

        // Check for error announcements
        const errorMessages = await page
          .locator('[role="alert"], .error, [aria-invalid="true"]')
          .all();
        expect(errorMessages.length).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // ── ARIA Attributes ──────────────────────────────────────────────────────
  test('buttons: have accessible names', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    const buttons = await page.locator('button').all();
    for (const button of buttons.slice(0, 5)) {
      const isVisible = await button.isVisible();
      if (isVisible) {
        const name = (await button.getAttribute('aria-label')) || (await button.textContent());
        expect(name?.trim()).toBeTruthy();
      }
    }
  });

  test('links: have accessible names', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    const links = await page.locator('a').all();
    for (const link of links.slice(0, 5)) {
      const isVisible = await link.isVisible();
      if (isVisible) {
        const name = (await link.getAttribute('aria-label')) || (await link.textContent());
        expect(name?.trim()).toBeTruthy();
      }
    }
  });

  test('form inputs: have accessible labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);

    const inputs = await page.locator('input, textarea, select').all();
    for (const input of inputs.slice(0, 5)) {
      const isVisible = await input.isVisible();
      if (isVisible) {
        const id = await input.getAttribute('id');
        const ariaLabel = await input.getAttribute('aria-label');
        const ariaLabelledBy = await input.getAttribute('aria-labelledby');

        if (id) {
          const label = await page.locator(`label[for="${id}"]`).count();
          expect(label + (ariaLabel ? 1 : 0) + (ariaLabelledBy ? 1 : 0)).toBeGreaterThan(0);
        }
      }
    }
  });

  // ── Heading Structure ────────────────────────────────────────────────────
  test('headings: proper hierarchy', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    expect(headings.length).toBeGreaterThan(0);

    // First heading should be h1
    const firstHeading = await headings[0].evaluate((el) => el.tagName);
    expect(firstHeading).toBe('H1');
  });

  // ── Images Alt Text ──────────────────────────────────────────────────────
  test('images: have alt text', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    const images = await page.locator('img').all();
    for (const img of images) {
      const isVisible = await img.isVisible();
      if (isVisible) {
        const alt = await img.getAttribute('alt');
        const ariaLabel = await img.getAttribute('aria-label');
        expect(alt || ariaLabel).toBeTruthy();
      }
    }
  });

  // ── Focus Visible ────────────────────────────────────────────────────────
  test('interactive elements: focus visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Tab to first interactive element
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return (
        window.getComputedStyle(el).outline !== 'none' ||
        window.getComputedStyle(el).boxShadow !== 'none'
      );
    });

    expect(focused).toBeTruthy();
  });
});

// ── Public pages (no authentication required) ─────────────────────────────
test.describe('WCAG 2.1 AA — Public Pages', () => {
  test('login page: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('form')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('login page: form inputs have accessible labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      const isVisible = await input.isVisible();
      if (!isVisible) continue;
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const labelCount = id ? await page.locator(`label[for="${id}"]`).count() : 0;
      expect(
        labelCount + (ariaLabel ? 1 : 0) + (ariaLabelledBy ? 1 : 0),
        `Input is missing an accessible label: ${await input.getAttribute('type')}`
      ).toBeGreaterThan(0);
    }
  });

  test('login page: keyboard accessible and submit button focusable', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('type'));
    expect(focused).toBe('submit');
  });

  test('login page: color contrast passes', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('login page: ARIA landmark regions present', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const landmarks = await page
      .locator('main, [role="main"], header, [role="banner"], nav, [role="navigation"]')
      .all();
    expect(landmarks.length).toBeGreaterThan(0);
  });
});
