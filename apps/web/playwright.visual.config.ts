/**
 * Playwright configuration for visual regression testing.
 *
 * Runs screenshot comparison tests across:
 *   - Browsers  : Chromium (Chrome), Firefox, WebKit (Safari)
 *   - Viewports : Desktop (1280×800), Tablet (768×1024), Mobile (390×844)
 *   - Themes    : Light and Dark
 *
 * Snapshot storage layout:
 *   e2e/snapshots/<browser>/<viewport>/<test-name>.png
 *
 * Commands:
 *   # Run all visual tests
 *   npx playwright test --config=playwright.visual.config.ts
 *
 *   # Update baselines after intentional UI changes
 *   npx playwright test --config=playwright.visual.config.ts --update-snapshots
 *
 *   # Run a single project only (e.g. chromium-desktop)
 *   npx playwright test --config=playwright.visual.config.ts --project=chromium-desktop
 */

import { defineConfig, devices } from '@playwright/test';
import type { VisualProject } from './e2e/visual/types';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

/**
 * Shared visual snapshot options.
 * maxDiffPixelRatio: allow up to 0.5 % pixel difference to absorb minor
 * anti-aliasing and sub-pixel rendering variations across platforms.
 * threshold: per-pixel colour channel difference tolerated (0–1).
 */
const SNAPSHOT_DEFAULTS = {
  maxDiffPixelRatio: 0.005, // 0.5 %
  threshold: 0.2,
  animations: 'disabled' as const,
};

/** Viewport dimensions we care about for responsive testing */
const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

export { SNAPSHOT_DEFAULTS, VIEWPORTS };

export default defineConfig<VisualProject>({
  testDir: './e2e/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-visual-report', open: 'never' }],
    ['json', { outputFile: 'playwright-visual-report/results.json' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],

  snapshotPathTemplate:
    'e2e/snapshots/{projectName}/{testFilePath}/{arg}{ext}',

  expect: {
    toHaveScreenshot: SNAPSHOT_DEFAULTS,
  },

  use: {
    baseURL: BASE_URL,
    // Keep trace & video for CI artefact inspection on failure
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Disable CSS transitions so screenshots are deterministic
    launchOptions: {
      args: ['--disable-smooth-scrolling'],
    },
  },

  // ---------------------------------------------------------------------------
  // Projects
  // Each project is a browser × viewport combination.
  // The "dark" variants reuse the same browser+viewport but force the dark
  // theme via localStorage before navigation.
  // ---------------------------------------------------------------------------
  projects: [
    // ── Chromium ────────────────────────────────────────────────────────────
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS.desktop,
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'desktop' },
    },
    {
      name: 'chromium-desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS.desktop,
        colorScheme: 'dark',
      },
      metadata: { theme: 'dark', viewportLabel: 'desktop' },
    },
    {
      name: 'chromium-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORTS.tablet,
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'tablet' },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: VIEWPORTS.mobile,
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'mobile' },
    },
    {
      name: 'chromium-mobile-dark',
      use: {
        ...devices['Pixel 5'],
        viewport: VIEWPORTS.mobile,
        colorScheme: 'dark',
      },
      metadata: { theme: 'dark', viewportLabel: 'mobile' },
    },

    // ── Firefox ─────────────────────────────────────────────────────────────
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        viewport: VIEWPORTS.desktop,
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'desktop' },
    },
    {
      name: 'firefox-desktop-dark',
      use: {
        ...devices['Desktop Firefox'],
        viewport: VIEWPORTS.desktop,
        colorScheme: 'dark',
      },
      metadata: { theme: 'dark', viewportLabel: 'desktop' },
    },
    {
      name: 'firefox-mobile',
      use: {
        ...devices['Galaxy S9+'],
        viewport: VIEWPORTS.mobile,
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'mobile' },
    },

    // ── WebKit / Safari ──────────────────────────────────────────────────────
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: VIEWPORTS.desktop,
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'desktop' },
    },
    {
      name: 'webkit-desktop-dark',
      use: {
        ...devices['Desktop Safari'],
        viewport: VIEWPORTS.desktop,
        colorScheme: 'dark',
      },
      metadata: { theme: 'dark', viewportLabel: 'desktop' },
    },
    {
      name: 'webkit-mobile',
      use: {
        ...devices['iPhone 14'],
        colorScheme: 'light',
      },
      metadata: { theme: 'light', viewportLabel: 'mobile' },
    },
    {
      name: 'webkit-mobile-dark',
      use: {
        ...devices['iPhone 14'],
        colorScheme: 'dark',
      },
      metadata: { theme: 'dark', viewportLabel: 'mobile' },
    },
  ],

  timeout: 45_000,
});
