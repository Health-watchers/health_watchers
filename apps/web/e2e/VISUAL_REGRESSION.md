# Visual Regression Testing

Visual regression tests catch unintended UI changes by screenshotting key pages
and comparing each render against a committed **baseline** ("golden") image.

This document covers the focused `visual-regression.spec.ts` suite that gates the
core UI design-system pages. (A separate, broader multi-browser suite lives under
`e2e/visual/` with `playwright.visual.config.ts`; the two are independent.)

## What is covered

`apps/web/e2e/visual-regression.spec.ts` screenshots these pages:

| Page           | Route            | Auth     |
| -------------- | ---------------- | -------- |
| Login (light)  | `/login`         | public   |
| Login (dark)   | `/login`         | public   |
| Dashboard      | `/`              | authed   |
| Patient detail | `/patients/:id`  | authed   |
| Encounter form | `/encounters/new`| authed   |
| Payment table  | `/payments`      | authed   |
| Patients list  | `/patients`      | authed   |
| Appointments   | `/appointments`  | authed   |
| Encounters list| `/encounters`    | authed   |

Authenticated tests log in as a doctor (`E2E_DOCTOR_EMAIL` / `E2E_DOCTOR_PASSWORD`)
in `beforeEach`. The patient-detail test uses `E2E_TEST_PATIENT_ID` when set, or
falls back to opening the patients list and following the first patient link.

## Tolerance threshold

Playwright's `toHaveScreenshot` (the Playwright equivalent of Jest's
`toMatchSnapshot`) compares the live screenshot to the baseline and fails when
the difference exceeds the tolerance. The shared options are:

```ts
const SNAPSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.02, // up to 2% of pixels may differ
  threshold: 0.2,          // per-pixel colour channel drift tolerated (0–1)
  animations: 'disabled',  // freeze transitions for deterministic frames
} as const;
```

- `maxDiffPixelRatio` is the overall tolerance: the test passes as long as no more
  than 2% of pixels differ, which absorbs anti-aliasing and sub-pixel rendering
  noise across platforms without masking real layout/colour changes.
- `threshold` is the per-pixel tolerance: a pixel counts as "different" only when
  a colour channel differs by more than 0.2 (on a 0–1 scale).

If a test is flaky because of genuine rendering noise, raise `maxDiffPixelRatio`
slightly. Avoid raising it too far or real regressions will slip through.

## Baseline storage

Baselines are **committed to version control** (this is required, not optional):

```
apps/web/e2e/visual-regression.spec.ts-snapshots/
├── .gitkeep
├── login-light-chromium.png
├── login-dark-chromium.png
├── dashboard-light-chromium.png
├── patient-detail-chromium.png
├── encounter-form-chromium.png
├── payment-table-chromium.png
└── …
```

Playwright names each baseline `<snapshot-name>-<project>.png` (the project is
`chromium` under the main `playwright.config.ts`). The directory is **not**
gitignored — `.gitignore` only excludes Jest's `**/__snapshots__/` and Playwright
*artifacts* (`playwright-report/`, `test-results/`), not the `*-snapshots/`
baseline directories.

Because baselines are committed, a PR that changes the UI is compared against the
known-good reference rather than regenerating a fresh baseline every run.

## Running the tests

```bash
# From the repo root — compare against committed baselines (CI behaviour)
npm run test:visual:gate --workspace=web

# Open the interactive Playwright UI
npm run test:e2e:ui --workspace=web -- e2e/visual-regression.spec.ts
```

The suite needs the API + web servers running and seeded data (same as the
broader e2e suite). See the `e2e` / `visual-regression-gate` CI jobs for the full
startup sequence.

## Updating baselines after an intentional UI change

When you intentionally change the UI, the existing baselines will no longer match
and the gate will fail. Update them:

```bash
# 1. Regenerate the baseline images
npm run test:visual:gate:update --workspace=web

# 2. Inspect the generated images / diffs to confirm they look right
#    (open apps/web/e2e/visual-regression.spec.ts-snapshots/ in your editor)

# 3. Commit the updated baselines
git add apps/web/e2e/visual-regression.spec.ts-snapshots
git commit -m "chore: update visual regression baselines"
```

Reviewing the new baselines before committing is important — `--update-snapshots`
will happily bake a broken layout into the new golden image.

## CI behaviour

The `visual-regression-gate` job in `.github/workflows/ci.yml`:

1. Starts the API (with a dedicated Mongo DB), seeds data, and starts the web app.
2. Runs `npm run test:visual:gate --workspace=web` against the **committed**
   baselines. A visual regression fails the job and blocks the PR.
3. Fails if any baseline is missing or was regenerated in CI (detected via
   `git status` on the snapshots directory), so baselines can never silently
   regenerate — they must be committed.
4. Uploads the HTML report and diff images as a `visual-regression-gate-report`
   artifact (retained 14 days) for review.
5. On `main`, uploads any regenerated baselines as a
   `visual-regression-gate-baselines` artifact so they can be downloaded and
   committed.

> **First run after introducing a new page:** the job will fail until a baseline
> for the new screenshot is generated locally (`test:visual:gate:update`) and
> committed. This is intentional — it keeps the golden images in version control.

To make visual regressions block staging deployments as well as PRs, add
`visual-regression-gate` to the `needs:` of the `deploy-staging` job (do this
once baselines are committed and the suite is stable).
