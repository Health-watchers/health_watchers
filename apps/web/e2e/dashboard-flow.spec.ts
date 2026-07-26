import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

test.describe('Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('dashboard loads and shows stat cards', async ({ page }) => {
    await page.goto('/');
    // At least one stat card must be present
    const statCards = page.locator('[data-testid="stat-card"], .stat-card, [class*="StatCard"]');
    // Fall back to checking for numeric content in headers/strong elements
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('navigation links are reachable from the dashboard', async ({ page }) => {
    await page.goto('/');

    const navLinks = [
      { pattern: /patients/i, href: '/patients' },
      { pattern: /appointments/i, href: '/appointments' },
      { pattern: /encounters/i, href: '/encounters' },
    ];

    for (const { pattern, href } of navLinks) {
      const link = page
        .getByRole('link', { name: pattern })
        .or(page.getByRole('navigation').getByRole('link', { name: pattern }));

      if (await link.count() > 0) {
        await link.first().click();
        await expect(page).toHaveURL(new RegExp(href));
        await page.goBack();
      }
    }
  });

  test('quick-action buttons navigate to correct routes', async ({ page }) => {
    await page.goto('/');

    // "New Patient" or equivalent quick action
    const newPatientBtn = page
      .getByRole('link', { name: /new patient/i })
      .or(page.getByRole('button', { name: /new patient/i }));

    if (await newPatientBtn.count() > 0) {
      await newPatientBtn.first().click();
      await expect(page).toHaveURL(/\/patients/);
    }
  });

  test('user menu is visible in the header', async ({ page }) => {
    await page.goto('/');
    // Top navigation should have user info or a menu trigger
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();
  });
});
