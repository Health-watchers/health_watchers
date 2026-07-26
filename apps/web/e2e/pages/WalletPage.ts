import { Page, Locator } from '@playwright/test';

export class WalletPage {
  readonly page: Page;
  readonly friendbotButton: Locator;
  readonly balanceDisplay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.friendbotButton = page.getByRole('button', { name: /fund.*friendbot|friendbot/i });
    this.balanceDisplay = page.getByTestId('wallet-balance').or(page.getByText(/balance/i).first());
  }

  async goto() {
    await this.page.goto('/wallet');
  }

  async fundWithFriendbot() {
    await this.friendbotButton.click();
  }

  async createPaymentIntent(amount: string, patientId: string, encounterId: string) {
    await this.page.getByRole('button', { name: /create.*payment|new payment/i }).click();
    await this.page.getByLabel(/amount/i).fill(amount);
    await this.page.getByLabel(/patient/i).selectOption(patientId);
    await this.page.getByLabel(/encounter/i).selectOption(encounterId);
    await this.page.getByRole('button', { name: /submit|create/i }).click();
  }

  async confirmPayment(transactionHash: string) {
    await this.page
      .getByRole('button', { name: /confirm/i })
      .first()
      .click();
    await this.page.getByLabel(/transaction.*hash|tx.*hash/i).fill(transactionHash);
    await this.page.getByRole('button', { name: /verify|confirm/i }).click();
  }

  async downloadReceipt() {
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByRole('button', { name: /download.*receipt|receipt/i }).click();
    return downloadPromise;
  }

  async fileDispute(reason: string) {
    await this.page.getByRole('button', { name: /dispute|file.*dispute/i }).click();
    await this.page.getByLabel(/reason/i).fill(reason);
    await this.page.getByRole('button', { name: /submit|file/i }).click();
  }

  async getPaymentStatus() {
    return this.page.getByTestId('payment-status').textContent();
  }
}
