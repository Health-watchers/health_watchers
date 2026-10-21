import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke test configuration.
 *
 * A deliberately small, fast set of critical-path web flows that assert the
 * application is up and its core journeys (login, patient list, search) work.
 * Runs across desktop browsers and mobile emulation so a release cannot
 * regress a form factor without being caught here.
 *
 * Run locally:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   SMOKE_DOCTOR_EMAIL=doctor@example.com SMOKE_DOCTOR_PASSWORD=Password123! \
 *   npx playwright test --config playwright.smoke.config.ts
 */
export default defineConfig({
  testDir: './e2e/smoke',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['json', { outputFile: '../smoke/reports/web-smoke-results.json' }],
    ['html', { open: 'never', outputFolder: '../smoke/reports/web-smoke-report' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-ios', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-android', use: { ...devices['Pixel 5'] } },
  ],
  timeout: 30_000,
});
