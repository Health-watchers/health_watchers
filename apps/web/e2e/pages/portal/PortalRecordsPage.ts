import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model for the patient portal records / timeline page.
 * Issue: #1486
 */
export class PortalRecordsPage {
  readonly page: Page;
  readonly timelineSection: Locator;
  readonly encounterCards: Locator;
  readonly recordsHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.timelineSection = page.locator('[data-testid="portal-timeline"], section:has-text("Timeline")');
    this.encounterCards = page.locator('[data-testid="encounter-card"], .encounter-card');
    this.recordsHeading = page.getByRole('heading', { name: /records|health.?records|my.?records/i });
  }

  async goto() {
    await this.page.goto('/portal/records');
  }

  async gotoTimeline() {
    await this.page.goto('/portal/timeline');
  }
}
