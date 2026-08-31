import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Shard across workers in CI so the full suite finishes in <10 minutes.
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Excludes payment spec so it runs in the dedicated project below
      testIgnore: ['**/payment-flow.spec.ts'],
    },
    {
      name: 'payment-flow',
      use: {
        ...devices['Desktop Chrome'],
        // Record video for every payment test run so the artifact is always
        // available when a test fails (not only on retry).
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
      },
      testMatch: ['**/payment-flow.spec.ts'],
    },
    {
      name: 'mobile-ios',
      use: { ...devices['iPhone 13'] },
      testMatch: ['**/mobile-responsive.spec.ts'],
    },
    {
      name: 'mobile-android',
      use: { ...devices['Pixel 5'] },
      testMatch: ['**/mobile-responsive.spec.ts'],
    },
  ],
  timeout: 30_000,
});
