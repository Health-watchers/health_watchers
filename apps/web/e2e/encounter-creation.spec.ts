import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { EncounterFormPage } from './pages/EncounterFormPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';
// A patient that exists in the seeded test DB
const TEST_PATIENT_ID = process.env.E2E_TEST_PATIENT_ID ?? '';

test.describe('Encounter Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('creates an encounter and it appears in patient history', async ({ page }) => {
    // Navigate to patient detail
    if (TEST_PATIENT_ID) {
      await page.goto(`/patients/${TEST_PATIENT_ID}`);
    } else {
      await page.goto('/patients');
      await page.getByRole('link', { name: /view/i }).first().click();
    }

    // Click New Encounter
    await page.getByRole('button', { name: /new encounter/i }).click();

    const form = new EncounterFormPage(page);
    await form.fillChiefComplaint('Headache and fever');
    await form.submit();

    // Encounter should appear in patient history
    await expect(page.getByText(/headache and fever/i)).toBeVisible();
  });

  test('generate AI summary on encounter', async ({ page }) => {
    if (TEST_PATIENT_ID) {
      await page.goto(`/patients/${TEST_PATIENT_ID}`);
    } else {
      await page.goto('/patients');
      await page.getByRole('link', { name: /view/i }).first().click();
    }

    // Switch to AI tab
    await page.getByRole('tab', { name: /ai/i }).click();

    const generateBtn = page.getByRole('button', { name: /generate.*summary/i });
    await generateBtn.click();

    // Wait for AI summary to appear (up to 15s for AI response)
    await expect(page.getByText(/generating/i)).toBeVisible();
    await expect(page.getByText(/generating/i)).not.toBeVisible({ timeout: 15_000 });
  });
});
