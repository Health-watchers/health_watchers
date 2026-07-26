import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for automated WCAG 2.1 AA accessibility testing.
 * Runs the specs inside the `tests/` directory which use @axe-core/playwright.
 *
 * Usage:
 *   npm run test:a11y --workspace=web
 *
 * In CI:
 *   The accessibility.yml workflow runs this config after starting the API
 *   and web servers, and publishes the JUnit results.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // run serially — each test navigates a full page
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-a11y-report' }],
    ['junit', { outputFile: 'accessibility-results.xml' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-a11y',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 60_000,
});
