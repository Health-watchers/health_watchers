import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the patient portal recurring payments pages.
 * Issue: #1690
 */
export class PortalRecurringPaymentsPage {
  readonly page: Page;
  readonly plans: Locator;
  readonly status: Locator;
  readonly alert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.plans = page.getByTestId('recurring-plan');
    this.status = page.getByRole('status');
    this.alert = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/portal/payments/recurring');
  }

  plan(description: string) {
    return this.plans.filter({ hasText: description });
  }

  async act(description: string, action: 'Pause' | 'Resume' | 'Cancel plan', reason?: string) {
    const plan = this.plan(description);
    await plan.getByRole('button', { name: action, exact: true }).click();
    const dialog = plan.getByRole('dialog');
    if (reason) await dialog.getByLabel(/reason/i).fill(reason);
    await dialog
      .getByRole('button', { name: /pause payments|resume payments|cancel plan/i })
      .click();
  }

  async openHistory(description: string) {
    await this.plan(description).getByRole('button', { name: /payment history/i }).click();
    return this.plan(description).getByRole('table', { name: /payment history/i });
  }
}
