import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

test.describe('Authentication Flow', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);

    // Should redirect away from /login
    await expect(page).not.toHaveURL(/\/login/);
    // User name should appear somewhere in the header/nav
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('invalid credentials shows error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.login('wrong@example.com', 'wrongpassword');

    await expect(loginPage.errorAlert).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout redirects to login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    // Click logout — look for a logout button or link
    const logoutBtn = page.getByRole('button', { name: /log.?out|sign.?out/i })
      .or(page.getByRole('link', { name: /log.?out|sign.?out/i }));
    await logoutBtn.click();

    await expect(page).toHaveURL(/\/login/);
  });

  test('protected page redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/patients');
    await expect(page).toHaveURL(/\/login/);
  });
});
