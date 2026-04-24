import { Page, Locator } from '@playwright/test';

export class PatientFormPage {
  readonly page: Page;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly dobInput: Locator;
  readonly sexSelect: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstNameInput = page.getByLabel(/first name/i);
    this.lastNameInput = page.getByLabel(/last name/i);
    this.dobInput = page.getByLabel(/date of birth/i);
    this.sexSelect = page.getByLabel(/sex/i);
    this.submitButton = page.getByRole('button', { name: /register|save|submit/i });
  }

  async goto() {
    await this.page.goto('/patients/new');
  }

  async fill(data: { firstName: string; lastName: string; dob: string; sex: string }) {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);
    await this.dobInput.fill(data.dob);
    await this.sexSelect.selectOption(data.sex);
  }

  async submit() {
    await this.submitButton.click();
  }
}
