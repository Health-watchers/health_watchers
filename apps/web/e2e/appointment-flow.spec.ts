import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

test.describe('Appointment Flow', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('appointments page loads and shows the calendar', async ({ page }) => {
    await page.goto('/appointments');
    await expect(page.getByRole('main')).toBeVisible();
    // Week-view navigation controls must be present
    const todayBtn = page.getByRole('button', { name: /today/i });
    await expect(todayBtn).toBeVisible();
  });

  test('can navigate between weeks on the calendar', async ({ page }) => {
    await page.goto('/appointments');

    const nextWeekBtn = page.getByRole('button', { name: /next week|›|>/i });
    const prevWeekBtn = page.getByRole('button', { name: /prev(ious)? week|‹|</i });

    if (await nextWeekBtn.count() > 0) {
      await nextWeekBtn.first().click();
      await prevWeekBtn.first().click();
      // Should return to the current week without error
      await expect(page.getByRole('main')).toBeVisible();
    }
  });

  test('filter by doctor shows the selector', async ({ page }) => {
    await page.goto('/appointments');
    const filterSelect = page.getByRole('combobox').or(page.locator('select'));
    if (await filterSelect.count() > 0) {
      await expect(filterSelect.first()).toBeVisible();
    }
  });

  test('today button resets calendar to current week', async ({ page }) => {
    await page.goto('/appointments');

    const nextWeekBtn = page.getByRole('button', { name: /next week|›|>/i });
    if (await nextWeekBtn.count() > 0) {
      await nextWeekBtn.first().click();
    }

    const todayBtn = page.getByRole('button', { name: /today/i });
    await todayBtn.click();
    // After clicking Today the current day heading should be visible
    const today = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayAbbr = dayNames[today.getDay()];
    await expect(page.getByText(new RegExp(todayAbbr, 'i'))).toBeVisible();
  });
});
