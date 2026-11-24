import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the patient portal appointments page.
 * Issue: #1486
 */
export class PortalAppointmentsPage {
  readonly page: Page;
  readonly bookButton: Locator;
  readonly appointmentCards: Locator;
  readonly cancelButton: Locator;
  readonly confirmDialog: Locator;
  readonly confirmCancelButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bookButton = page.getByRole('button', { name: /book.?appointment|schedule/i });
    this.appointmentCards = page.locator('[data-testid="appointment-card"], .appointment-card');
    this.cancelButton = page.getByRole('button', { name: /cancel.?appointment/i });
    this.confirmDialog = page.getByRole('dialog');
    this.confirmCancelButton = this.confirmDialog.getByRole('button', { name: /confirm|yes/i });
    this.successMessage = page.getByRole('status').or(page.locator('.toast-success'));
  }

  async goto() {
    await this.page.goto('/portal/appointments');
  }

  async cancelFirstAppointment() {
    await this.cancelButton.first().click();
    await this.confirmCancelButton.click();
  }
}
