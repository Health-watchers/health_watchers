import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the patient portal login page (/portal/login).
 * Issue: #1486
 */
export class PortalLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly otpInput: Locator;
  readonly submitButton: Locator;
  readonly otpSubmitButton: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel(/email/i);
    this.passwordInput = page.getByLabel(/password/i);
    this.otpInput = page.getByLabel(/one.?time.?code|otp|verification.?code/i);
    this.submitButton = page.getByRole('button', { name: /sign.?in|log.?in/i });
    this.otpSubmitButton = page.getByRole('button', { name: /verify|submit|continue/i });
    this.errorAlert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/portal/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async enterOtp(code: string) {
    await this.otpInput.fill(code);
    await this.otpSubmitButton.click();
  }

  async loginWithMfa(email: string, password: string, otpCode: string) {
    await this.login(email, password);
    await this.enterOtp(otpCode);
  }
}
