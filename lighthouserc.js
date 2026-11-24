/**
 * Lighthouse CI configuration
 *
 * Routes audited:
 *   /          – marketing / landing page
 *   /login     – authentication page
 *   /patients  – patient list (requires auth → uses auth bypass header)
 *   /portal/dashboard – provider portal dashboard (requires auth)
 *
 * Thresholds:
 *   performance   ≥ 80
 *   accessibility ≥ 95
 *
 * Reports are uploaded as GitHub Actions artifacts by the workflow; no
 * separate LHCI server is required, though LHCI_TOKEN can be set to
 * enable Vercel/self-hosted remote storage.
 */

/** @type {import('@lhci/cli').LighthouseRcConfig} */
module.exports = {
  ci: {
    collect: {
      // Run Lighthouse against the locally-started Next.js production server.
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/login',
        'http://localhost:3000/patients',
        'http://localhost:3000/portal/dashboard',
      ],

      // How many Lighthouse runs per URL — median is taken for assertions.
      numberOfRuns: 3,

      // Use the "navigation" strategy (full page load, not SPA snapshot).
      settings: {
        // Auth bypass: inject a custom request header that the Next.js
        // middleware / API recognises as a trusted CI session, bypassing the
        // login redirect for protected routes.
        // The header value is read from the LHCI_AUTH_TOKEN env var at
        // runtime (set as a GitHub Actions secret).
        extraHeaders: {
          'X-LHCI-Auth': process.env.LHCI_AUTH_TOKEN || '',
        },

        // Run in a throttled desktop profile for reproducible scores.
        // Switch to 'mobile' for a mobile-first audit.
        preset: 'desktop',

        // Skip the PWA category — this is a healthcare app, not a PWA.
        skipAudits: ['installable-manifest', 'service-worker', 'apple-touch-icon'],

        // Chrome flags safe for a headless CI runner
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },

    assert: {
      // Fail CI when scores fall below these thresholds.
      // 'error' = hard fail; 'warn' = informational only.
      assertions: {
        // Core score thresholds (acceptance criteria)
        'categories:performance': ['error', { minScore: 0.80 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.85 }],
        'categories:seo': ['warn', { minScore: 0.80 }],

        // Critical accessibility audits — zero tolerance
        'color-contrast': ['error', { minScore: 1 }],
        'document-title': ['error', { minScore: 1 }],
        'html-has-lang': ['error', { minScore: 1 }],
        'image-alt': ['error', { minScore: 1 }],
        'label': ['error', { minScore: 1 }],
        'link-name': ['error', { minScore: 1 }],

        // Performance budget guardrails
        'first-contentful-paint': ['warn', { maxNumericValue: 3000 }],
        'interactive': ['warn', { maxNumericValue: 5000 }],
        'total-blocking-time': ['warn', { maxNumericValue: 600 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'speed-index': ['warn', { maxNumericValue: 4500 }],

        // Security
        'is-on-https': 'off', // localhost is HTTP in CI — skip
      },
    },

    upload: {
      // Write JSON + HTML reports to .lighthouseci/ so the workflow can
      // upload them as artifacts and the PR comment script can read scores.
      target: 'filesystem',
      outputDir: '.lighthouseci',
      reportFilenamePattern: 'lhr-%%DATETIME%%-%%HOSTNAME%%.json',
    },
  },
};
