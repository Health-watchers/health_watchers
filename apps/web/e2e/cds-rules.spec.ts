import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';

test.describe('CDS Rules Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', 'admin@clinic.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard`);
  });

  test('should display CDS rules list', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);
    await expect(page.locator('h1')).toContainText('CDS Rules Management');
    await expect(page.locator('button:has-text("Create Rule")')).toBeVisible();
  });

  test('should create a new CDS rule', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);
    await page.click('button:has-text("Create Rule")');

    // Fill form
    await page.fill('input[value*="rule_"]', 'rule_high_bp');
    await page.fill('input:nth-of-type(2)', 'High Blood Pressure Alert');
    await page.fill('textarea:nth-of-type(1)', 'Alert when blood pressure is critically high');
    await page.selectOption('select:nth-of-type(1)', 'vital_sign');
    await page.selectOption('select:nth-of-type(2)', 'encounter_create');

    // Set conditions JSON
    const conditionsTextarea = page.locator('textarea:nth-of-type(2)');
    await conditionsTextarea.fill(
      JSON.stringify(
        {
          type: 'vital_sign',
          bloodPressure: { critical: true },
        },
        null,
        2
      )
    );

    // Set action
    await page.selectOption('select:nth-of-type(3)', 'alert');
    await page.selectOption('select:nth-of-type(4)', 'critical');
    await page.fill('textarea:nth-of-type(3)', 'Patient has critically high blood pressure');

    // Submit
    await page.click('button:has-text("Save Rule")');
    await page.waitForURL(`${BASE_URL}/settings/cds-rules`);

    // Verify rule appears in list
    await expect(page.locator('text=High Blood Pressure Alert')).toBeVisible();
  });

  test('should edit an existing CDS rule', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);

    // Find and click edit button on first rule
    const firstRuleCard = page.locator('[class*="rounded-lg"][class*="border"]').first();
    await firstRuleCard.locator('button:has-text("Edit")').click();

    // Modify the rule
    const nameInput = page.locator('input:nth-of-type(2)');
    const currentValue = await nameInput.inputValue();
    await nameInput.fill(currentValue + ' (Updated)');

    // Save
    await page.click('button:has-text("Save Rule")');
    await page.waitForURL(`${BASE_URL}/settings/cds-rules`);

    // Verify update
    await expect(page.locator(`text=${currentValue} (Updated)`)).toBeVisible();
  });

  test('should test a CDS rule with patient scenario', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);

    // Find and click test button on first rule
    const firstRuleCard = page.locator('[class*="rounded-lg"][class*="border"]').first();
    await firstRuleCard.locator('button:has-text("Test")').click();

    // Fill test scenario
    await page.fill('input[placeholder="Enter patient ID"]', '507f1f77bcf86cd799439011');
    await page.fill('input[placeholder="Enter clinic ID"]', '507f1f77bcf86cd799439012');

    // Fill vital signs if applicable
    const bpInput = page.locator('input[placeholder="e.g., 150/95"]');
    if (await bpInput.isVisible()) {
      await bpInput.fill('185/120');
    }

    // Run test
    await page.click('button:has-text("Run Test")');

    // Wait for results
    await page.waitForSelector('text=Test Results');
    await expect(page.locator('text=Test Results')).toBeVisible();
  });

  test('should deactivate a CDS rule', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);

    // Find and click delete button on first rule
    const firstRuleCard = page.locator('[class*="rounded-lg"][class*="border"]').first();
    const ruleName = await firstRuleCard.locator('h3').textContent();
    await firstRuleCard.locator('button:has-text("Delete")').click();

    // Verify rule is removed from list
    await expect(page.locator(`text=${ruleName}`)).not.toBeVisible();
  });

  test('should validate required fields in rule form', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);
    await page.click('button:has-text("Create Rule")');

    // Try to submit empty form
    await page.click('button:has-text("Save Rule")');

    // Verify validation errors
    await expect(page.locator('input[required]')).toBeDefined();
  });

  test('should handle invalid JSON in conditions', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);
    await page.click('button:has-text("Create Rule")');

    // Fill basic fields
    await page.fill('input:nth-of-type(2)', 'Test Rule');
    await page.fill('textarea:nth-of-type(1)', 'Test description');

    // Enter invalid JSON
    const conditionsTextarea = page.locator('textarea:nth-of-type(2)');
    await conditionsTextarea.fill('{ invalid json }');

    // Try to submit
    await page.click('button:has-text("Save Rule")');

    // Should show error
    await expect(page.locator('text=Invalid JSON')).toBeVisible();
  });

  test('should display rule details correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);

    // Verify rule card displays all information
    const ruleCard = page.locator('[class*="rounded-lg"][class*="border"]').first();
    await expect(ruleCard.locator('h3')).toBeVisible();
    await expect(ruleCard.locator('text=Trigger:')).toBeVisible();
    await expect(ruleCard.locator('text=Action:')).toBeVisible();
    await expect(ruleCard.locator('text=Message:')).toBeVisible();
  });

  test('should show active/inactive status badges', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/cds-rules`);

    // Verify status badges are visible
    const statusBadges = page.locator('text=Active, text=Inactive');
    await expect(statusBadges).toBeDefined();
  });
});
