#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "No global state management or API data caching" \
  --label "enhancement" \
  --body "**Branch:** \`feat/tanstack-query-integration\`
**Timeframe:** 2 days

## Description
Each page independently fetches data in a \`useEffect\` with no caching, deduplication, or shared state. Navigating between pages re-fetches data every time. There is no way to invalidate the cache after a mutation.

## Tasks
- Install \`@tanstack/react-query\` (TanStack Query v5) in \`apps/web\`
- Create a \`QueryClientProvider\` wrapper and add it to \`layout.tsx\`
- Replace all \`useEffect\` + \`fetch\` patterns with \`useQuery\` hooks
- Define query keys in a central \`queryKeys.ts\` file
- After successful form submissions, call \`queryClient.invalidateQueries()\`

## Acceptance Criteria
- Navigating away from and back to the patients page does not re-fetch if data is less than 30 seconds old
- Creating a new patient automatically refreshes the patient list without a manual page reload
- No raw \`useEffect\` + \`fetch\` patterns remain in any page component

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No search UI for patients and no patient detail page" \
  --label "enhancement" \
  --body "**Branch:** \`feat/patient-search-ui-detail-page\`
**Timeframe:** 3 days

## Description
The API has \`GET /patients/search?q=\` and \`GET /patients/:id\` but the web UI has no search input and no way to view a patient's full details. In a real EMR, searching for a patient and viewing their full record is the primary workflow.

## Tasks
- Add a debounced search input to \`patients/page.tsx\` that calls \`GET /patients/search?q=\` after 300ms
- Create \`apps/web/src/app/patients/[id]/page.tsx\` as a patient detail page
- Add a 'View' button/link in the patients table
- The detail page should fetch patient, encounters, and payments in parallel

## Acceptance Criteria
- Typing in the search box filters the patient list in real time (debounced at 300ms)
- Clicking 'View' on a patient navigates to \`/patients/:id\`
- The patient detail page displays all fields, encounter history, and payment history

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No Content-Security-Policy on the Next.js web app" \
  --label "security" \
  --body "**Branch:** \`feat/csp-headers-nextjs\`
**Timeframe:** 1 day

## Description
The Next.js app has no CSP headers. Without CSP, any XSS vulnerability can execute arbitrary scripts, steal tokens from cookies, or exfiltrate patient data. For a healthcare application, CSP is a mandatory defence-in-depth control.

## Tasks
- Add a \`headers()\` function to \`apps/web/next.config.js\` that sets security headers on all routes
- Set \`Content-Security-Policy\` restricting: \`default-src 'self'\`, \`script-src 'self'\`, etc.
- Set \`X-Frame-Options: DENY\`, \`X-Content-Type-Options: nosniff\`, \`Referrer-Policy\`, \`Permissions-Policy\`

## Acceptance Criteria
- \`curl -I http://localhost:3000\` shows \`Content-Security-Policy\` header
- No CSP violations appear in the browser console during normal app usage
- \`X-Frame-Options: DENY\` prevents the app from being embedded in an iframe

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No \`robots.txt\` or \`sitemap.xml\` for the web app" \
  --label "bug" \
  --body "**Branch:** \`fix/robots-txt-noindex\`
**Timeframe:** 2 hours

## Description
The Next.js web app has no \`robots.txt\`. Search engines may index patient-facing pages, exposing the application's URL structure and potentially sensitive route patterns.

## Tasks
- Create \`apps/web/public/robots.txt\` with \`User-agent: * \\n Disallow: /\` to block all crawlers
- Add a \`<meta name=\"robots\" content=\"noindex, nofollow\">\` tag to \`layout.tsx\`

## Acceptance Criteria
- \`GET /robots.txt\` returns \`User-agent: * \\n Disallow: /\`
- All pages include \`<meta name=\"robots\" content=\"noindex, nofollow\">\`

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No internationalisation (i18n) support" \
  --label "enhancement" \
  --body "**Branch:** \`feat/i18n-internationalisation\`
**Timeframe:** 3 days

## Description
All user-facing strings in the web app are hardcoded in English. For a healthcare application that may serve non-English-speaking patients and clinicians, i18n support is essential.

## Tasks
- Install \`next-intl\` in \`apps/web\`
- Create locale files: \`en.json\` and \`fr.json\`
- Extract all hardcoded UI strings into the locale files
- Add a language switcher component to the \`NavBar\`
- Store the user's preferred language in their profile

## Acceptance Criteria
- Switching to French in the UI displays all labels, buttons, and messages in French
- The selected language persists across page refreshes (stored in a cookie)
- API error messages respect the \`Accept-Language\` header

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No accessibility (a11y) compliance" \
  --label "enhancement" \
  --body "**Branch:** \`feat/accessibility-a11y-compliance\`
**Timeframe:** 3 days

## Description
The web app has no accessibility considerations. There are no ARIA labels, no keyboard navigation support, no screen reader support, and no focus management. WCAG 2.1 AA compliance is both a legal requirement (ADA, Section 508) and an ethical obligation.

## Tasks
- Install \`eslint-plugin-jsx-a11y\` and add it to the ESLint config for \`apps/web\`
- Fix all existing a11y lint errors
- Add \`aria-label\` attributes to all icon buttons and interactive elements without visible text
- Ensure all form inputs have associated \`<label>\` elements
- Implement keyboard navigation for modals and dropdowns (focus trap, Escape to close)

## Acceptance Criteria
- \`eslint-plugin-jsx-a11y\` reports zero errors across all components
- All interactive elements are reachable and operable via keyboard alone
- \`axe-core\` audit reports zero critical or serious violations

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No mobile responsiveness" \
  --label "enhancement" \
  --body "**Branch:** \`feat/mobile-responsive-layout\`
**Timeframe:** 3 days

## Description
All pages use fixed pixel widths and desktop-oriented layouts. The web app is unusable on mobile devices. Clinical staff often use tablets or phones at the point of care.

## Tasks
- Audit all pages for fixed-width layouts and replace with responsive Tailwind classes
- Make the data tables horizontally scrollable on small screens or switch to a card-based layout on mobile
- Make the \`NavBar\` collapse into a hamburger menu on small screens
- Test all pages on viewport widths: 375px, 768px, 1280px
- Add a \`<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\` tag

## Acceptance Criteria
- All pages are usable on a 375px wide viewport without horizontal scrolling
- The \`NavBar\` collapses to a hamburger menu on screens narrower than 768px
- Lighthouse mobile score is ≥ 80

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No test suite — zero test coverage across the entire codebase" \
  --label "enhancement" \
  --body "**Branch:** \`feat/test-suite-setup\`
**Timeframe:** 5 days

## Description
There are zero test files anywhere in the monorepo. No unit tests, no integration tests, no end-to-end tests. The CI pipeline has no test step. For a healthcare application handling patient data and financial transactions, this is unacceptable.

## Tasks
- Install \`jest\`, \`ts-jest\`, \`supertest\`, \`@types/jest\`, \`@types/supertest\` in the API package
- Configure \`jest.config.ts\` at the monorepo root and per-package
- Write unit tests for: \`token.service.ts\`, \`validate.middleware.ts\`, \`rbac.middleware.ts\`
- Write integration tests using \`supertest\` + \`mongodb-memory-server\`
- Add \`test\` task to \`turbo.json\`
- Add \`npm run test\` step to CI workflow

## Acceptance Criteria
- \`npm run test\` runs and passes with no errors
- Code coverage for \`token.service.ts\` and \`validate.middleware.ts\` is ≥ 90%
- CI fails if any test fails
- Integration tests use an in-memory DB, not the real MongoDB instance"

gh issue create --repo "$REPO" \
  --title "CI pipeline has no test step and only runs on \`main\`" \
  --label "enhancement" \
  --body "**Branch:** \`feat/ci-test-step-all-branches\`
**Timeframe:** 1 day

## Description
\`.github/workflows/ci.yml\` only runs \`npm install\`, \`npm run build\`, and \`npm run lint\`. There is no \`npm run test\` step. Additionally, CI only triggers on pushes and PRs to \`main\`. Feature branches have zero CI coverage.

## Tasks
- Add \`- run: npm run test\` step to the CI workflow after \`npm run lint\`
- Change the trigger to run on all pull requests regardless of target branch
- Add a separate \`security\` job that runs \`npm audit --audit-level=high\`
- Add branch protection rules documentation in \`CONTRIBUTING.md\`

## Acceptance Criteria
- Opening a PR to any branch triggers the CI workflow
- A failing test causes the CI check to fail and blocks the PR merge
- \`npm audit\` with high-severity vulnerabilities fails the CI build"

gh issue create --repo "$REPO" \
  --title "No Docker / containerization — no reproducible deployment environment" \
  --label "enhancement" \
  --body "**Branch:** \`feat/docker-containerization\`
**Timeframe:** 3 days

## Description
No \`Dockerfile\` or \`docker-compose.yml\` exists. Local setup requires manually installing MongoDB, configuring ports, and running three separate processes. There is no way to reproduce the production environment locally.

## Tasks
- Create \`apps/api/Dockerfile\` using a multi-stage build
- Create \`apps/stellar-service/Dockerfile\` with the same multi-stage pattern
- Create \`apps/web/Dockerfile\` using \`node:18-alpine\`
- Create \`docker-compose.yml\` at the root wiring up: \`api\`, \`web\`, \`stellar-service\`, \`mongodb\`
- Add \`.dockerignore\` files to each app

## Acceptance Criteria
- \`docker-compose up\` starts all four services successfully
- The web app at \`http://localhost:3000\` can communicate with the API at \`http://localhost:3001\`
- MongoDB data persists across container restarts via a named volume
- Production Docker images are under 200MB"
