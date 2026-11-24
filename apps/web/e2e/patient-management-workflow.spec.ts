import { test, expect } from '@playwright/test';

/**
 * End-to-end coverage for the patient management workflow: search,
 * view record, update details, and add a clinical note. Complements
 * patient-registration.spec.ts (which covers new-patient creation).
 */

test.describe('Patient management workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('provider@healthwatchers.test');
    await page.getByLabel(/password/i).fill('Test-Password-123!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/dashboard|patients/);
  });

  test('search finds an existing patient by name', async ({ page }) => {
    await page.goto('/patients');
    await page.getByPlaceholder(/search patients/i).fill('Jane Doe');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/jane doe/i)).toBeVisible();
  });

  test('opening a patient shows their record summary', async ({ page }) => {
    await page.goto('/patients');
    await page.getByPlaceholder(/search patients/i).fill('Jane Doe');
    await page.keyboard.press('Enter');
    await page.getByText(/jane doe/i).first().click();
    await expect(page.getByRole('heading', { name: /jane doe/i })).toBeVisible();
    await expect(page.getByText(/date of birth|dob/i)).toBeVisible();
  });

  test('editing patient contact details persists after reload', async ({ page }) => {
    await page.goto('/patients');
    await page.getByPlaceholder(/search patients/i).fill('Jane Doe');
    await page.keyboard.press('Enter');
    await page.getByText(/jane doe/i).first().click();

    await page.getByRole('button', { name: /edit/i }).click();
    const phoneField = page.getByLabel(/phone/i);
    await phoneField.fill('555-0100');
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.getByText(/555-0100/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/555-0100/)).toBeVisible();
  });

  test('adding a clinical note appears in the patient timeline', async ({ page }) => {
    await page.goto('/patients');
    await page.getByPlaceholder(/search patients/i).fill('Jane Doe');
    await page.keyboard.press('Enter');
    await page.getByText(/jane doe/i).first().click();

    await page.getByRole('button', { name: /add note/i }).click();
    await page.getByLabel(/note/i).fill('Patient reports improved symptoms.');
    await page.getByRole('button', { name: /save note|submit/i }).click();

    await expect(page.getByText(/patient reports improved symptoms/i)).toBeVisible();
  });
});
