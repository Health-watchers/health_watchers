import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * Staff passkeys (issue #1496) against a virtual platform authenticator.
 *
 * The authenticator is created through the Chrome DevTools Protocol, so this runs on
 * Chromium only; Safari is covered by manual testing (WebKit exposes no virtual authenticator).
 * The test cleans up the passkey it registers so the shared doctor account stays password-only.
 */

const DOCTOR_EMAIL = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
const DOCTOR_PASSWORD = process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!';

async function addVirtualPlatformAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal', // platform authenticator (Touch ID / Windows Hello equivalent)
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

async function openSecuritySettings(page: Page) {
  await page.goto('/settings');
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: 'Security' })
    .click();
  await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
}

test.describe('Passkeys (WebAuthn)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Virtual authenticators need CDP');

  test('registers a platform passkey, signs in with it, then removes it', async ({ page }) => {
    const passkeyName = `E2E laptop ${Date.now()}`;
    await addVirtualPlatformAuthenticator(page);

    // 1. Password sign-in, then register a passkey from settings
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DOCTOR_EMAIL, DOCTOR_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    await openSecuritySettings(page);
    await page.getByLabel('New passkey name').fill(passkeyName);
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await expect(page.getByText(passkeyName)).toBeVisible();

    // 2. Sign out and back in with the passkey alone (it satisfies MFA for DOCTOR)
    await page
      .getByRole('button', { name: /log.?out|sign.?out/i })
      .or(page.getByRole('link', { name: /log.?out|sign.?out/i }))
      .first()
      .click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByRole('button', { name: /passkey/i }).click();
    await expect(page).not.toHaveURL(/\/(login|mfa)/);

    // 3. Clean up
    await openSecuritySettings(page);
    const row = page.getByRole('listitem').filter({ hasText: passkeyName });
    await row.getByRole('button', { name: 'Remove' }).click();
    await row.getByRole('button', { name: 'Remove' }).click(); // confirm
    await expect(page.getByText(passkeyName)).toHaveCount(0);
  });
});
