import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { PatientFormPage } from './pages/PatientFormPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

test.describe('Patient Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('registers a new patient and redirects to detail page', async ({ page }) => {
    const form = new PatientFormPage(page);
    await form.goto();

    await form.fill({
      firstName: 'Test',
      lastName: 'Patient',
      dob: '1990-01-15',
      sex: 'M',
    });
    await form.submit();

    // Should show success feedback and redirect to patient detail
    await expect(page).toHaveURL(/\/patients\/.+/);
    await expect(page.getByText(/test patient/i)).toBeVisible();
  });

  test('new patient appears in patients list', async ({ page }) => {
    await page.goto('/patients');
    await expect(page.getByText(/test patient/i)).toBeVisible();
  });
});
