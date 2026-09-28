import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the patient portal messaging page.
 * Issue: #1486
 */
export class PortalMessagingPage {
  readonly page: Page;
  readonly newMessageButton: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messageThread: Locator;
  readonly recipientSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newMessageButton = page.getByRole('button', { name: /new.?message|compose/i });
    this.messageInput = page.getByRole('textbox', { name: /message|body/i })
      .or(page.locator('textarea[name="message"], [data-testid="message-input"]'));
    this.sendButton = page.getByRole('button', { name: /send/i });
    this.messageThread = page.locator('[data-testid="message-thread"], .message-thread');
    this.recipientSelect = page.getByLabel(/to:|recipient/i)
      .or(page.locator('select[name="recipient"], [data-testid="recipient-select"]'));
  }

  async goto() {
    await this.page.goto('/portal/messages');
  }

  async sendMessage(body: string) {
    await this.messageInput.fill(body);
    await this.sendButton.click();
  }
}
