import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AxeResults, Result } from 'axe-core';
import * as fs from 'fs';
import * as path from 'path';

// ── Violation reporter ────────────────────────────────────────────────────────

/**
 * Format axe violations into a human-readable string for assertion messages.
 */
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

/**
 * Persist violation details to a JSON report for compliance tracking.
 * The report is uploaded as a CI artefact for trend analysis.
 */
function reportViolations(pageName: string, results: AxeResults): void {
  const reportDir = path.join(process.cwd(), 'accessibility-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    page: pageName,
    url: results.url,
    violations: results.violations.map((v: Result) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      wcagTags: v.tags.filter((t: string) => t.startsWith('wcag')),
      nodeCount: v.nodes.length,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        html: n.html,
        target: n.target,
        failureSummary: n.failureSummary,
      })),
    })),
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
  };

  const filename = `${pageName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.json`;
  fs.writeFileSync(path.join(reportDir, filename), JSON.stringify(report, null, 2));
}

const BASE_URL = 'http://localhost:3000';

// ── Authenticated tests ───────────────────────────────────────────────────────

test.describe('WCAG 2.1 AA Accessibility — Authenticated Pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@clinic.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────
  test('dashboard: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    reportViolations('dashboard', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('dashboard: keyboard navigation', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(['button', 'link', 'menuitem']).toContain(focused);

    await page.keyboard.press('Shift+Tab');
    const refocused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    expect(refocused).toBeTruthy();
  });

  test('dashboard: screen reader live regions present', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const liveRegions = await page.locator('[role="status"], [role="alert"], [aria-live]').all();
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  // ── Patients ───────────────────────────────────────────────────────────────
  test('patients: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    reportViolations('patients', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('patients: keyboard navigation in table', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT']).toContain(focused);
  });

  test('patients: form inputs have accessible labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      if (id) {
        const label = await page.locator(`label[for="${id}"]`).count();
        expect(label).toBeGreaterThan(0);
      }
    }
  });

  test('patients: modal focus trap and restoration', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);

    const createButton = page.locator('button:has-text("Create"), button:has-text("New")').first();
    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForSelector('[role="dialog"]');

      const modalContainsFocus = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        return modal?.contains(document.activeElement);
      });
      expect(modalContainsFocus).toBeTruthy();

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

      await page.waitForTimeout(100);
      const restoredFocus = await page.evaluate(() => document.activeElement?.tagName);
      expect(restoredFocus).toBeTruthy();
    }
  });

  // ── Encounters ─────────────────────────────────────────────────────────────
  test('encounters: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/encounters`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    reportViolations('encounters', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('encounters: form error announcements use ARIA alerts', async ({ page }) => {
    await page.goto(`${BASE_URL}/encounters`);

    const submitButton = page.locator('button[type="submit"]').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      const errors = await page.locator('[role="alert"]').all();
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  // ── Payments ───────────────────────────────────────────────────────────────
  test('payments: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/payments`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    reportViolations('payments', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('payments: color contrast passes', async ({ page }) => {
    await page.goto(`${BASE_URL}/payments`);
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    reportViolations('payments-contrast', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  // ── Settings ───────────────────────────────────────────────────────────────
  test('settings: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator('h1')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    reportViolations('settings', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('settings: navigation is keyboard accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    const navItems = await page.locator('nav button, nav a').all();
    expect(navItems.length).toBeGreaterThan(0);

    for (const item of navItems.slice(0, 3)) {
      if (await item.isVisible()) {
        await item.focus();
        const focused = await page.evaluate(() => document.activeElement?.tagName);
        expect(['BUTTON', 'A']).toContain(focused);
      }
    }
  });

  // ── ARIA attributes ────────────────────────────────────────────────────────
  test('buttons: have accessible names', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const buttons = await page.locator('button').all();
    for (const button of buttons.slice(0, 5)) {
      if (await button.isVisible()) {
        const name = (await button.getAttribute('aria-label')) || (await button.textContent());
        expect(name?.trim()).toBeTruthy();
      }
    }
  });

  test('links: have accessible names', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const links = await page.locator('a').all();
    for (const link of links.slice(0, 5)) {
      if (await link.isVisible()) {
        const name = (await link.getAttribute('aria-label')) || (await link.textContent());
        expect(name?.trim()).toBeTruthy();
      }
    }
  });

  test('form inputs: have accessible labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/patients`);
    const inputs = await page.locator('input, textarea, select').all();
    for (const input of inputs.slice(0, 5)) {
      if (await input.isVisible()) {
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

  // ── Heading structure ──────────────────────────────────────────────────────
  test('headings: proper hierarchy starting with h1', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    expect(headings.length).toBeGreaterThan(0);
    const first = await headings[0].evaluate((el) => el.tagName);
    expect(first).toBe('H1');
  });

  // ── Images ─────────────────────────────────────────────────────────────────
  test('images: have alt text', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    const images = await page.locator('img').all();
    for (const img of images) {
      if (await img.isVisible()) {
        const alt = await img.getAttribute('alt');
        const ariaLabel = await img.getAttribute('aria-label');
        expect(alt || ariaLabel).toBeTruthy();
      }
    }
  });

  // ── Focus visible ──────────────────────────────────────────────────────────
  test('interactive elements: focus outline is visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.keyboard.press('Tab');
    const hasFocusStyle = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const styles = window.getComputedStyle(el);
      return styles.outline !== 'none' || styles.boxShadow !== 'none';
    });
    expect(hasFocusStyle).toBeTruthy();
  });
});

// ── Public pages ──────────────────────────────────────────────────────────────

test.describe('WCAG 2.1 AA Accessibility — Public Pages', () => {
  test('login page: no WCAG 2.1 AA violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('form')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    reportViolations('login', results);
    expect(results.violations, formatViolations(results)).toHaveLength(0);
  });

  test('login page: form inputs have accessible labels', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const inputs = await page.locator('input').all();
    for (const input of inputs) {
      if (!(await input.isVisible())) continue;
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      const labelCount = id ? await page.locator(`label[for="${id}"]`).count() : 0;
      expect(
        labelCount + (ariaLabel ? 1 : 0) + (ariaLabelledBy ? 1 : 0),
        `Input missing accessible label: ${await input.getAttribute('type')}`
      ).toBeGreaterThan(0);
    }
  });

  test('login page: submit button is keyboard focusable', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('type'));
    expect(focused).toBe('submit');
  });

  test('login page: color contrast passes', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    reportViolations('login-contrast', results);
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
