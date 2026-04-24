import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { WalletPage } from './pages/WalletPage';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

test.describe('Payment Flow (Testnet)', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('fund wallet with Friendbot and verify balance', async ({ page }) => {
    const wallet = new WalletPage(page);
    await wallet.goto();

    // Fund with Friendbot (testnet only)
    await wallet.fundWithFriendbot();

    // Wait for balance to update
    await expect(wallet.balanceDisplay).toContainText(/10000|balance/i, { timeout: 10_000 });
  });

  test('initiate and confirm payment', async ({ page }) => {
    await page.goto('/wallet');

    // Initiate payment
    const initiateBtn = page.getByRole('button', { name: /initiate.*payment|new payment/i });
    await initiateBtn.click();

    // Fill payment form (adjust selectors based on actual form)
    await page.getByLabel(/amount/i).fill('10');
    await page.getByLabel(/destination/i).fill('GBTESTADDRESS...');
    await page.getByRole('button', { name: /submit|create/i }).click();

    // Payment should appear as pending
    await expect(page.getByText(/pending/i)).toBeVisible();

    // Confirm payment
    await page.getByRole('button', { name: /confirm/i }).first().click();

    // Status should change to confirmed
    await expect(page.getByText(/confirmed/i)).toBeVisible({ timeout: 15_000 });
  });
});
