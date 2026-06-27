import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

test.describe('Path payment selection UI', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/payments');
  });

  test('opens the new payment dialog with asset selectors', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Payment' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Receive Asset')).toBeVisible();
    await expect(dialog.getByLabel('Pay with Asset')).toBeVisible();
  });

  test('same source and destination asset hides path selection', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Payment' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Amount to Receive').fill('10.00');
    // Both XLM (the defaults) → no cross-asset path needed.
    await dialog.getByLabel('Receive Asset').selectOption('XLM');
    await dialog.getByLabel('Pay with Asset').selectOption('XLM');

    await expect(dialog.getByText('Available Paths')).toHaveCount(0);
  });

  test('selecting a different pay-with asset triggers path discovery and confirmation', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '+ New Payment' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Patient ID').fill('507f1f77bcf86cd799439011');
    await dialog.getByLabel('Amount to Receive').fill('10.00');

    // Clinic receives USDC, patient pays with XLM → cross-asset path payment.
    await dialog.getByLabel('Receive Asset').selectOption('USDC');
    await dialog.getByLabel('Pay with Asset').selectOption('XLM');

    // The path-finding panel renders: either available paths, a loading state,
    // or a "no liquidity" message — all confirm the discovery flow ran.
    const pathsHeading = dialog.getByText('Available Paths');
    const noLiquidity = dialog.getByText('No liquidity found for this conversion.');
    await expect(pathsHeading.or(noLiquidity)).toBeVisible({ timeout: 10_000 });

    // When liquidity exists, a path is selectable and exchange rate is shown.
    if (await pathsHeading.isVisible()) {
      const firstPath = dialog.locator('input[name="selectedPath"]').first();
      await firstPath.check();
      await expect(firstPath).toBeChecked();
      await expect(dialog.getByText(/1 USDC ≈/)).toBeVisible();

      // Path payments require an explicit confirmation step before submitting.
      await dialog.getByRole('button', { name: 'Create Payment Intent' }).click();
      const confirmDialog = page.getByRole('dialog').filter({ hasText: 'Confirm Path Payment' });
      await expect(confirmDialog).toBeVisible();
      await expect(confirmDialog.getByText('Estimated Patient Pays')).toBeVisible();
    }
  });
});
