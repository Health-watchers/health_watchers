import { Page, Locator } from '@playwright/test';
import { WalletPage } from './WalletPage';

/**
 * PaymentPage extends WalletPage with interactions for the full Stellar
 * payment lifecycle: intent → QR → confirm → receipt, plus refund,
 * dispute, and claimable-balance flows.
 */
export class PaymentPage extends WalletPage {
  readonly qrCodeCanvas: Locator;
  readonly paymentStatusBadge: Locator;
  readonly receiptSection: Locator;

  constructor(page: Page) {
    super(page);
    this.qrCodeCanvas = page.locator('canvas').or(page.getByTestId('qr-code'));
    this.paymentStatusBadge = page
      .getByTestId('payment-status')
      .or(page.getByRole('status'))
      .first();
    this.receiptSection = page.getByTestId('payment-receipt').or(
      page.getByText(/receipt/i).first()
    );
  }

  /** Navigate to the payments list page */
  async gotoPayments() {
    await this.page.goto('/payments');
  }

  /** Navigate to the disputes page */
  async gotoDisputes() {
    await this.page.goto('/disputes');
  }

  /**
   * Complete create-intent flow and return the intent ID shown in the UI.
   * Falls back to the mock ID if the element is not found.
   */
  async createIntentAndGetId(
    amount: string,
    patientId: string,
    encounterId: string
  ): Promise<string> {
    await this.createPaymentIntent(amount, patientId, encounterId);
    const el = this.page.getByTestId('intent-id').or(
      this.page.locator('[data-intent-id]')
    );
    return (await el.textContent({ timeout: 3_000 }).catch(() => null)) ?? '';
  }

  /** Wait until the QR code canvas is visible (indicates pending intent) */
  async waitForQRCode() {
    await this.qrCodeCanvas.waitFor({ state: 'visible', timeout: 8_000 });
  }

  /** Poll until the payment status badge matches the expected text */
  async waitForStatus(statusPattern: RegExp, timeout = 15_000) {
    await this.page.waitForFunction(
      (pattern) => {
        const el =
          document.querySelector('[data-testid="payment-status"]') ??
          document.querySelector('[role="status"]');
        return el ? new RegExp(pattern).test(el.textContent ?? '') : false;
      },
      statusPattern.source,
      { timeout }
    );
  }

  /** Issue a refund for the currently displayed confirmed payment */
  async issueRefund() {
    await this.page.getByRole('button', { name: /issue.*refund|refund/i }).click();
    const confirmBtn = this.page.getByRole('button', {
      name: /confirm.*refund|yes.*refund|yes/i,
    });
    await confirmBtn.waitFor({ timeout: 3_000 });
    await confirmBtn.click();
  }

  /** Retry a failed payment by clicking the retry button */
  async retryPayment() {
    await this.page.getByRole('button', { name: /retry/i }).click();
  }

  /** Open the claimable-balance creation modal and submit */
  async createClaimableBalance(
    amount: string,
    recipientKey: string,
    claimableAfterDays = 0,
    claimableUntilDays = 30
  ) {
    await this.page
      .getByRole('button', { name: /create.*claimable|claimable.*balance/i })
      .click();

    await this.page.getByLabel(/amount/i).fill(amount);
    await this.page.getByLabel(/recipient|claimant/i).fill(recipientKey);

    // Set claimable window using date inputs when present
    const afterInput = this.page.getByLabel(/claimable.*after|from/i);
    const untilInput = this.page.getByLabel(/claimable.*until|expires/i);
    if (await afterInput.isVisible({ timeout: 500 }).catch(() => false)) {
      const after = new Date(Date.now() + claimableAfterDays * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const until = new Date(Date.now() + claimableUntilDays * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await afterInput.fill(after);
      await untilInput.fill(until);
    }

    await this.page.getByRole('button', { name: /^create$/i }).click();
  }

  /** Click the claim button for the first available claimable balance */
  async claimBalance() {
    await this.page.getByRole('button', { name: /^claim$/i }).first().click();
  }
}
