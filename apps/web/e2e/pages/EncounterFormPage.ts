import { Page, Locator } from '@playwright/test';

export class EncounterFormPage {
  readonly page: Page;
  readonly chiefComplaintInput: Locator;
  readonly submitButton: Locator;
  readonly generateAiButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chiefComplaintInput = page.getByLabel(/chief complaint/i);
    this.submitButton = page.getByRole('button', { name: /save|submit|create/i });
    this.generateAiButton = page.getByRole('button', { name: /generate.*summary|ai summary/i });
  }

  async fillChiefComplaint(text: string) {
    await this.chiefComplaintInput.fill(text);
  }

  async submit() {
    await this.submitButton.click();
  }
}
