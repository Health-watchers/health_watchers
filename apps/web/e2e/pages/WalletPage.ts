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
}
