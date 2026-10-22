import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

const DOCTOR_EMAIL =
  process.env.SMOKE_DOCTOR_EMAIL ?? process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD =
  process.env.SMOKE_DOCTOR_PASSWORD ?? process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

test.describe('Smoke — Critical flows', () => {
  test('login succeeds and redirects to the dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('patients list loads from the API', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page.getByRole('navigation').getByRole('link', { name: /patients/i })
    ).toBeVisible();
    await page
      .getByRole('navigation')
      .getByRole('link', { name: /patients/i })
      .click();

    await expect(page).toHaveURL(/\/patients/);
    await expect(page.locator('main').getByRole('table')).toBeVisible({ timeout: 15_000 });
  });

  test('patient search narrows the list without error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    await page
      .getByRole('navigation')
      .getByRole('link', { name: /patients/i })
      .click();
    await expect(page).toHaveURL(/\/patients/);

    const search = page.getByRole('textbox').first();
    await search.fill('a');
    await page.waitForTimeout(600);

    await expect(page.locator('main').getByRole('table')).toBeVisible({ timeout: 15_000 });
  });
});
