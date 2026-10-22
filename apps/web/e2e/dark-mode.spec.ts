import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

// next-themes applies the theme as a class on <html> and persists the choice
// under localStorage["theme"]. The ThemeProvider lives in the root layout, so
// these behaviours are observable on public routes (e.g. /login) too.

test.describe('Dark mode — system preference', () => {
  test.use({ colorScheme: 'dark' });

  test('respects the OS dark preference by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

test.describe('Dark mode — light system preference', () => {
  test.use({ colorScheme: 'light' });

  test('renders light by default when the OS prefers light', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});

test.describe('Dark mode — persistence', () => {
  test('a persisted dark preference survives reloads', async ({ page }) => {
    // Simulate a previously-saved preference (what the toggle writes).
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));

    await page.goto('/login');
    await expect(page.locator('html')).toHaveClass(/dark/);

    // The body background should actually be the dark token, not white.
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(255, 255, 255)');

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('a persisted light preference survives reloads', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));

    await page.goto('/login');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('the preference is stored under localStorage["theme"] across sessions', async ({
    page,
    context,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    await page.getByRole('button', { name: /switch to dark mode/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // The toggle must write the choice to localStorage so it can be restored.
    const stored = await page.evaluate(() => window.localStorage.getItem('theme'));
    expect(stored).toBe('dark');

    // Simulate a brand-new session: drop all in-memory state but keep storage.
    const storageState = await context.storageState();
    const newPage = await context.newPage();
    await newPage.addInitScript(() => {
      // no-op; storage state is applied by the context below
    });
    await context.addInitScript(() => {
      // ensure the persisted value is present before the app boots
    });
    await newPage.close();

    const freshContext = await page.context().browser()!.newContext({ storageState });
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');
    await expect(freshPage.locator('html')).toHaveClass(/dark/);
    const freshStored = await freshPage.evaluate(() => window.localStorage.getItem('theme'));
    expect(freshStored).toBe('dark');
    await freshContext.close();
  });
});

test.describe('Dark mode — toggle from the UI', () => {
  test.use({ colorScheme: 'light' });

  test('toggling dark mode flips the theme and persists it', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    // The TopBar toggle is labelled by its target mode.
    await page.getByRole('button', { name: /switch to dark mode/i }).click();
    await expect(html).toHaveClass(/dark/);

    // Preference persists across a reload.
    await page.reload();
    await expect(html).toHaveClass(/dark/);

    // And can be switched back.
    await page.getByRole('button', { name: /switch to light mode/i }).click();
    await expect(html).not.toHaveClass(/dark/);
  });
});

test.describe('Dark mode — applied across pages', () => {
  test.use({ colorScheme: 'light' });

  // Routes that should honour the persisted dark preference. The portal
  // subsection is included explicitly so its pages are covered too.
  const routes = [
    '/',
    '/patients',
    '/encounters',
    '/payments',
    '/cds',
    '/analytics',
    '/portal',
    '/portal/appointments',
    '/portal/messages',
    '/portal/records',
  ];

  test('the dark class is applied on every page', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'dark'));

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('html')).toHaveClass(/dark/);

      // The page background should be the dark token, not white.
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg, `body background on ${route}`).not.toBe('rgb(255, 255, 255)');
    }
  });
});
