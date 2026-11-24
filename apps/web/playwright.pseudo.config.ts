import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the pseudo-locale (en-XA) visual pass.
 *
 * Captures screenshots of key pages with every message accented and padded by
 * ~40 %, so truncation, overflow and hard-coded English literals are easy to
 * spot. Requires the web app to run in development mode (`npm run dev`), which
 * generates messages/en-XA.json and enables the locale.
 *
 * Usage:
 *   npm run test:pseudo --workspace=web
 *
 * Output:
 *   pseudo-locale-report/screenshots/<project>/<page>.png
 *   pseudo-locale-report/findings.json  (untranslated literals + overflow)
 */
export default defineConfig({
  testDir: './e2e/pseudo-locale',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'pseudo-locale-report/html' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  timeout: 60_000,
});
