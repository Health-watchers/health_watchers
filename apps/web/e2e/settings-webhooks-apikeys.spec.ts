import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * End-to-end coverage for the Webhook & API Key panels in /settings (issue #1806).
 *
 * These panels previously built `Authorization: Bearer <localStorage.getItem('accessToken')>`
 * against the API directly; the access token is only ever set as an httpOnly cookie
 * by the BFF, so the header was always empty and every request 401'd. They now go
 * through apiV1Fetch (cookie credentials + CSRF). These tests exercise that path in
 * a real logged-in browser session: list, create, then revoke/delete.
 *
 * Environment variables (fall back to development seeds):
 *   E2E_DOCTOR_EMAIL    — admin account that can reach /settings
 *   E2E_DOCTOR_PASSWORD — matching password
 */

const EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

async function loginAndOpenSettings(page: Page) {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(EMAIL, PASSWORD);
  await page.waitForURL(/\/(dashboard|patients|appointments|encounters)/, { timeout: 10_000 });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

function settingsNav(page: Page) {
  return page.getByRole('navigation', { name: 'Settings sections' });
}

test.describe('Settings — Webhooks & API Keys (#1806)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndOpenSettings(page);
    // Delete/revoke use native window.confirm() — accept them so the action proceeds.
    page.on('dialog', (dialog) => dialog.accept());
  });

  test('lists, creates, and deletes a webhook', async ({ page }) => {
    await settingsNav(page).getByRole('button', { name: 'Webhooks' }).click();
    // The panel rendered — i.e. the list call did not die on an empty Bearer token.
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();

    const url = `https://example.com/webhook-e2e-${Date.now()}`;
    await page.getByRole('button', { name: '+ New Webhook' }).click();
    await page.getByPlaceholder('https://your-server.com/webhook').fill(url);
    // Select one event so the submit button enables.
    await page.getByRole('button', { name: 'payment.confirmed' }).click();
    await page.getByRole('button', { name: 'Create Webhook' }).click();

    const row = page.getByRole('row').filter({ hasText: url });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Delete via the details modal so the account is left clean.
    await row.getByRole('button', { name: 'Details' }).click();
    await page.getByRole('button', { name: 'Delete Webhook' }).click();
    await expect(row).toHaveCount(0, { timeout: 10_000 });
  });

  test('lists, creates, and revokes an API key', async ({ page }) => {
    await settingsNav(page).getByRole('button', { name: 'API Keys' }).click();
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible();

    const keyName = `E2E Key ${Date.now()}`;
    await page.getByRole('button', { name: '+ New API Key' }).click();
    await page.getByPlaceholder('e.g. Lab System Integration').fill(keyName);
    await page.getByRole('button', { name: 'patients:read' }).click();
    await page.getByRole('button', { name: 'Generate API Key' }).click();

    // The one-time secret is shown exactly once.
    await expect(page.getByText(/will only be shown once/i)).toBeVisible({ timeout: 10_000 });

    const row = page.getByRole('row').filter({ hasText: keyName });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Revoke it so the account is left clean.
    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(row.getByText('Revoked')).toBeVisible({ timeout: 10_000 });
  });
});
