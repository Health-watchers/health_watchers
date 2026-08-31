import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility (Axe) coverage for the main public and authenticated
 * pages, run as part of the standard E2E suite so a11y regressions are
 * caught alongside functional failures.
 */

const PAGES = ['/', '/login', '/dashboard', '/patients'];

for (const path of PAGES) {
  test(`page ${path} has no critical accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );

    if (critical.length) {
      console.log(JSON.stringify(critical, null, 2));
    }
    expect(critical).toEqual([]);
  });
}
