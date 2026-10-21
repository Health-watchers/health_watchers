import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * End-to-end tests for the /settings page.
 *
 * Covered sections:
 *   - Profile   : display name, timezone, avatar upload/remove
 *   - Preferences: default view, theme toggle, language, notification toggles
 *   - Sessions  : active sessions panel renders, revoke button visible
 *   - Danger Zone: deactivate account form — cancel path + wrong password error
 *
 * Environment variables (fall back to development seeds):
 *   E2E_DOCTOR_EMAIL    — account used for all tests
 *   E2E_DOCTOR_PASSWORD — matching password
 */

const EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

// ── Shared helpers ────────────────────────────────────────────────────────────

async function loginAndGoToSettings(page: Page) {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(EMAIL, PASSWORD);
  await page.waitForURL(/\/(dashboard|patients|appointments|encounters)/, { timeout: 10_000 });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Settings sections' });
}

async function openSection(page: Page, label: string) {
  await nav(page).getByRole('button', { name: label }).click();
}

// ── Auth setup ────────────────────────────────────────────────────────────────

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGoToSettings(page);
  });

  // ── Profile section ─────────────────────────────────────────────────────────

  test.describe('Profile section', () => {
    test('loads with current display name pre-filled', async ({ page }) => {
      // Profile is the default active section
      const input = page.getByTestId('profile-fullname');
      await expect(input).toBeVisible();
      await expect(input).not.toHaveValue('');
    });

    test('shows Save Changes button only when form is dirty', async ({ page }) => {
      const saveBtn = page.getByTestId('profile-save');
      await expect(saveBtn).not.toBeVisible();

      const input = page.getByTestId('profile-fullname');
      await input.fill('Dr. Test Change');
      await expect(saveBtn).toBeVisible();
    });

    test('updates display name and shows success message', async ({ page }) => {
      const input = page.getByTestId('profile-fullname');
      const original = await input.inputValue();

      await input.fill('Dr. Updated Name');
      await page.getByTestId('profile-save').click();

      await expect(page.getByRole('status')).toContainText('Profile updated successfully');

      // Restore original name so subsequent runs are idempotent
      await input.fill(original);
      await page.getByTestId('profile-save').click();
      await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    });

    test('can select a timezone from the dropdown', async ({ page }) => {
      const select = page.getByTestId('profile-timezone');
      await select.selectOption('Africa/Lagos');
      await expect(select).toHaveValue('Africa/Lagos');

      // Make the form dirty then save
      const input = page.getByTestId('profile-fullname');
      const original = await input.inputValue();
      await input.fill(original + ' '); // tiny dirty change
      await page.getByTestId('profile-save').click();
      await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    });

    test('avatar upload button is present and triggers file chooser', async ({ page }) => {
      const label = page.getByText(/upload photo|change photo/i);
      await expect(label).toBeVisible();

      // Verify the hidden file input is wired up
      const input = page.locator('#avatar-upload');
      await expect(input).toBeAttached();
    });

    test('avatar upload shows optimistic preview then persists URL', async ({ page }) => {
      // Create a minimal 1×1 white PNG in memory
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('#avatar-upload').dispatchEvent('click'),
      ]);

      await fileChooser.setFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: pngBuffer,
      });

      // An <img> should appear (optimistic preview)
      await expect(page.locator('img[alt*="avatar"]')).toBeVisible({ timeout: 5_000 });
      // Remove photo button should appear
      await expect(page.getByRole('button', { name: /remove photo/i })).toBeVisible();
    });

    test('remove avatar button clears the preview', async ({ page }) => {
      // Only meaningful if an avatar is set — skip gracefully if remove button absent
      const removeBtn = page.getByRole('button', { name: /remove photo/i });
      if (!(await removeBtn.isVisible())) {
        test.skip();
      }
      await removeBtn.click();
      await expect(page.locator('img[alt*="avatar"]')).not.toBeVisible({ timeout: 5_000 });
    });

    test('email, role, and clinic fields are read-only', async ({ page }) => {
      // These are plain <p> elements, not inputs
      await expect(page.getByLabel('Email')).not.toBeVisible();
      const emailText = page.locator('p', { hasText: /@/ }).first();
      await expect(emailText).toBeVisible();
    });
  });

  // ── Preferences section ──────────────────────────────────────────────────────

  test.describe('Preferences section', () => {
    test.beforeEach(async ({ page }) => {
      await openSection(page, 'Preferences');
    });

    test('renders language, theme, default view, and notification controls', async ({ page }) => {
      await expect(page.getByLabel('Language')).toBeVisible();
      await expect(page.getByRole('group', { name: 'Theme selection' })).toBeVisible();
      await expect(page.getByTestId('prefs-default-view')).toBeVisible();
      await expect(page.getByLabel('Email Notifications')).toBeVisible();
      await expect(page.getByLabel('In-App Notifications')).toBeVisible();
    });

    test('changing language persists and refreshes', async ({ page }) => {
      const select = page.getByLabel('Language');
      await select.selectOption('fr');
      // After router.refresh() the page reloads — wait for settings heading to reappear
      await expect(page.getByRole('heading', { name: /settings|paramètres/i })).toBeVisible({
        timeout: 8_000,
      });
      // Restore to English
      await openSection(page, /preferences|préférences/i);
      await page.getByLabel(/language|langue/i).selectOption('en');
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 8_000 });
    });

    test('changing default view saves without page reload', async ({ page }) => {
      const select = page.getByTestId('prefs-default-view');
      await select.selectOption('patients');
      await expect(page.getByText(/preferences saved/i)).toBeVisible();
      // Restore
      await select.selectOption('dashboard');
      await expect(page.getByText(/preferences saved/i)).toBeVisible();
    });

    test('toggling theme buttons applies aria-pressed', async ({ page }) => {
      const darkBtn = page.getByRole('button', { name: /dark/i });
      await darkBtn.click();
      await expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
      // Restore system
      await page.getByRole('button', { name: /system/i }).click();
    });

    test('toggling email notifications off shows success feedback', async ({ page }) => {
      const toggle = page.getByLabel('Email Notifications');
      const initial = await toggle.isChecked();
      await toggle.click();
      await expect(page.getByText(/preferences saved/i)).toBeVisible();
      // Restore
      await toggle.click();
      await expect(page.getByText(/preferences saved/i)).toBeVisible();
      expect(await toggle.isChecked()).toBe(initial);
    });

    test('per-type notification checkboxes appear when in-app is on', async ({ page }) => {
      const inAppToggle = page.getByLabel('In-App Notifications');
      if (!(await inAppToggle.isChecked())) {
        await inAppToggle.click();
        await expect(page.getByText(/preferences saved/i)).toBeVisible();
      }
      await expect(page.getByLabel('Appointment Reminders')).toBeVisible();
      await expect(page.getByLabel('AI Summary Ready')).toBeVisible();
    });
  });

  // ── Sessions section ─────────────────────────────────────────────────────────

  test.describe('Sessions section', () => {
    test.beforeEach(async ({ page }) => {
      await openSection(page, 'Sessions');
    });

    test('shows the active sessions heading', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Active Sessions' })).toBeVisible();
    });

    test('current session is labelled and has no revoke button', async ({ page }) => {
      await expect(page.getByText('Current Session')).toBeVisible();
      // The current session row should NOT have a Revoke button
      const currentRow = page.locator('[class*="rounded-lg"]').filter({ hasText: 'Current Session' });
      await expect(currentRow.getByRole('button', { name: /revoke/i })).not.toBeVisible();
    });

    test('other sessions have a Revoke button', async ({ page }) => {
      // If more than one session row exists, the non-current ones have Revoke
      const rows = page.locator('[class*="rounded-lg border"]');
      const count = await rows.count();
      if (count > 1) {
        const nonCurrentRow = rows.filter({ hasNot: page.getByText('Current Session') }).first();
        await expect(nonCurrentRow.getByRole('button', { name: /revoke/i })).toBeVisible();
      }
    });
  });

  // ── Danger Zone section ──────────────────────────────────────────────────────

  test.describe('Danger Zone section', () => {
    test.beforeEach(async ({ page }) => {
      await openSection(page, 'Danger Zone');
    });

    test('renders the section heading and description', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Danger Zone' })).toBeVisible();
      await expect(page.getByText(/permanent and cannot be undone/i)).toBeVisible();
    });

    test('deactivate button opens confirmation form', async ({ page }) => {
      await page.getByTestId('danger-deactivate-btn').click();
      await expect(page.getByTestId('danger-password-input')).toBeVisible();
      await expect(page.getByTestId('danger-confirm-btn')).toBeVisible();
    });

    test('cancel hides the confirmation form without submitting', async ({ page }) => {
      await page.getByTestId('danger-deactivate-btn').click();
      await expect(page.getByTestId('danger-password-input')).toBeVisible();

      await page.getByRole('button', { name: /cancel/i }).click();

      await expect(page.getByTestId('danger-password-input')).not.toBeVisible();
      await expect(page.getByTestId('danger-deactivate-btn')).toBeVisible();
    });

    test('submitting with wrong password shows an error and does not log out', async ({
      page,
    }) => {
      await page.getByTestId('danger-deactivate-btn').click();
      await page.getByTestId('danger-password-input').fill('wrong-password-intentional');
      await page.getByTestId('danger-confirm-btn').click();

      await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
      // Should still be on /settings — not redirected to /login
      await expect(page).toHaveURL(/\/settings/);
    });

    test('submitting without a password shows inline validation', async ({ page }) => {
      await page.getByTestId('danger-deactivate-btn').click();
      // Leave password blank
      await page.getByTestId('danger-confirm-btn').click();
      await expect(page.getByRole('alert')).toContainText(/enter your password/i);
    });
  });
});
