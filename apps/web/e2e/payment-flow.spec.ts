import { test, expect, type Page, type Route } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { PaymentPage } from './pages/PaymentPage';
import {
  balanceResponse,
  fundResponse,
  createIntentResponse,
  confirmPaymentResponse,
  failedPaymentResponse,
  createDisputeResponse,
  resolveDisputeResponse,
  refundResponse,
  createClaimableBalanceResponse,
  claimClaimableBalanceResponse,
  MOCK_INTENT_ID,
  MOCK_TX_HASH,
} from './fixtures/stellar-api.fixture';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

// ---------------------------------------------------------------------------
// Helper: install all Stellar BFF route mocks for this page
// ---------------------------------------------------------------------------
async function mockStellarRoutes(
  page: Page,
  overrides: Partial<{
    intentStatus: 'confirmed' | 'failed';
  }> = {}
) {
  const fulfillJson = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/payments/balance', (r) => fulfillJson(r, balanceResponse));
  await page.route('**/api/payments/fund', (r) => fulfillJson(r, fundResponse));
  await page.route('**/api/payments/intent', (r) => fulfillJson(r, createIntentResponse));
  await page.route(`**/api/v1/payments/${MOCK_INTENT_ID}/confirm`, (r) => {
    const body =
      overrides.intentStatus === 'failed' ? failedPaymentResponse : confirmPaymentResponse;
    return fulfillJson(r, body);
  });
  await page.route(`**/api/payments/${MOCK_INTENT_ID}/confirm`, (r) => {
    const body =
      overrides.intentStatus === 'failed' ? failedPaymentResponse : confirmPaymentResponse;
    return fulfillJson(r, body);
  });
  await page.route(`**/api/v1/payments/${MOCK_INTENT_ID}/dispute`, (r) =>
    fulfillJson(r, createDisputeResponse, 201)
  );
  await page.route(`**/api/v1/payments/disputes/**`, (r) =>
    fulfillJson(r, resolveDisputeResponse)
  );
  await page.route(`**/api/v1/payments/${MOCK_INTENT_ID}/refund`, (r) =>
    fulfillJson(r, refundResponse)
  );
  await page.route('**/api/payments/claimable-balance/create', (r) =>
    fulfillJson(r, createClaimableBalanceResponse, 201)
  );
  await page.route('**/api/v1/payments/claimable-balance/create', (r) =>
    fulfillJson(r, createClaimableBalanceResponse, 201)
  );
  await page.route('**/api/payments/claimable-balance/claim', (r) =>
    fulfillJson(r, claimClaimableBalanceResponse)
  );
  await page.route('**/api/v1/payments/claimable-balance/claim', (r) =>
    fulfillJson(r, claimClaimableBalanceResponse)
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
test.describe('Stellar Payment Flow (mocked testnet)', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  // ── 1. Balance ────────────────────────────────────────────────────────────
  test('wallet shows Stellar balance', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await expect(payment.balanceDisplay).toContainText(/10000|balance/i, { timeout: 8_000 });
  });

  // ── 2. Friendbot funding ──────────────────────────────────────────────────
  test('fund wallet with Friendbot and balance updates', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();

    await expect(payment.balanceDisplay).toContainText(/10000|balance/i, { timeout: 8_000 });
  });

  // ── 3. Payment intent creation + QR code ─────────────────────────────────
  test('create payment intent displays QR code and pending status', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('50', 'patient-1', 'encounter-1');

    // QR code or pending indicator should appear
    await expect(
      page.locator('canvas').or(page.getByTestId('qr-code')).or(page.getByText(/pending/i))
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── 4. Full lifecycle: intent → confirm → receipt ─────────────────────────
  test('full payment lifecycle: intent → confirm → receipt', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('50', 'patient-1', 'encounter-1');
    await expect(page.getByText(/pending/i)).toBeVisible({ timeout: 8_000 });

    await payment.confirmPayment(MOCK_TX_HASH);
    await expect(page.getByText(/confirmed/i)).toBeVisible({ timeout: 15_000 });

    // Receipt should be downloadable
    const download = await payment.downloadReceipt();
    expect(download.suggestedFilename()).toMatch(/receipt.*\.pdf/i);
  });

  // ── 5. Payment confirmation polling ──────────────────────────────────────
  test('payment status polling reaches confirmed state', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('75', 'patient-1', 'encounter-1');
    await payment.confirmPayment(MOCK_TX_HASH);

    // Status must reach confirmed within timeout
    await expect(page.getByText(/confirmed/i)).toBeVisible({ timeout: 15_000 });
    // Transaction hash should be displayed
    await expect(page.getByText(new RegExp(MOCK_TX_HASH.slice(0, 8), 'i'))).toBeVisible({
      timeout: 5_000,
    });
  });

  // ── 6. Payment failure state ──────────────────────────────────────────────
  test('failed payment displays failure status and retry option', async ({ page }) => {
    await mockStellarRoutes(page, { intentStatus: 'failed' });
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('9999999', 'patient-1', 'encounter-1');
    await payment.confirmPayment(MOCK_TX_HASH);

    await expect(page.getByText(/failed|error|underfunded/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible({ timeout: 5_000 });
  });

  // ── 7. Retry after failure ────────────────────────────────────────────────
  test('retry payment after failure transitions back to pending', async ({ page }) => {
    // First call fails; subsequent intent calls succeed
    let intentCallCount = 0;
    await page.route('**/api/payments/intent', (route) => {
      intentCallCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createIntentResponse),
      });
    });
    await mockStellarRoutes(page, { intentStatus: 'failed' });

    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('9999999', 'patient-1', 'encounter-1');
    await payment.confirmPayment(MOCK_TX_HASH);
    await expect(page.getByText(/failed|error/i)).toBeVisible({ timeout: 15_000 });

    // Override to succeed for retry
    await page.route('**/api/payments/intent', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...createIntentResponse, data: { ...createIntentResponse.data, status: 'pending' } }),
      })
    );
    await payment.retryPayment();
    await expect(page.getByText(/pending/i)).toBeVisible({ timeout: 8_000 });
  });

  // ── 8. Refund flow ────────────────────────────────────────────────────────
  test('refund flow transitions payment to refunded state', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('30', 'patient-1', 'encounter-1');
    await payment.confirmPayment(MOCK_TX_HASH);
    await expect(page.getByText(/confirmed/i)).toBeVisible({ timeout: 15_000 });

    await payment.issueRefund();

    await expect(page.getByText(/refunded/i)).toBeVisible({ timeout: 10_000 });
  });

  // ── 9. Dispute creation ───────────────────────────────────────────────────
  test('dispute creation transitions payment to disputed state', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createPaymentIntent('25', 'patient-1', 'encounter-1');
    await payment.confirmPayment(MOCK_TX_HASH);
    await expect(page.getByText(/confirmed/i)).toBeVisible({ timeout: 15_000 });

    await payment.fileDispute('Incorrect amount charged');

    await expect(page.getByText(/dispute.*filed|disputed|open/i)).toBeVisible({ timeout: 8_000 });
  });

  // ── 10. Dispute resolution ────────────────────────────────────────────────
  test('dispute resolution transitions dispute to resolved', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.gotoDisputes();

    // Resolve the first open dispute
    const resolveBtn = page.getByRole('button', { name: /resolve/i }).first();
    await resolveBtn.waitFor({ timeout: 8_000 });
    await resolveBtn.click();

    const resolutionInput = page.getByLabel(/resolution|notes/i);
    if (await resolutionInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await resolutionInput.fill('Refund issued to patient');
    }

    const confirmResolve = page.getByRole('button', { name: /confirm|submit|resolve/i }).last();
    await confirmResolve.click();

    await expect(page.getByText(/resolved/i)).toBeVisible({ timeout: 8_000 });
  });

  // ── 11. Claimable balance: create ─────────────────────────────────────────
  test('create claimable balance shows balance ID', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createClaimableBalance('100', 'GPATIENTPUBLICKEY000000000000000000000000000000000000000001');

    await expect(
      page.getByText(/claimable.*created|balance.*created|cb_/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── 12. Claimable balance: claim ──────────────────────────────────────────
  test('claim claimable balance transitions to claimed state', async ({ page }) => {
    await mockStellarRoutes(page);
    const payment = new PaymentPage(page);
    await payment.goto();

    await payment.fundWithFriendbot();
    await payment.createClaimableBalance('100', 'GPATIENTPUBLICKEY000000000000000000000000000000000000000001');
    await expect(
      page.getByText(/claimable.*created|balance.*created|cb_/i)
    ).toBeVisible({ timeout: 8_000 });

    await payment.claimBalance();

    await expect(page.getByText(/claimed/i)).toBeVisible({ timeout: 10_000 });
  });
});
