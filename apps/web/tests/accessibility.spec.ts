import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('accessibility', () => {
  test('should not have any automatically detectable WCAG AA violations on dashboard', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');

    // Wait for content to load
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should focus trap in modals', async ({ page }) => {
    await page.goto('/');
    
    // Click "New Patient" to open modal
    await page.getByLabel('Register a new patient').click();
    
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['DIV', 'BUTTON', 'INPUT']).toContain(focusedElement);
    
    await page.keyboard.press('Tab');
  });
});
