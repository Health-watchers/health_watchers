#!/usr/bin/env bash
set -e

# Issues 134–146

gh issue create \
  --title "No \`NEXT_PUBLIC_API_URL\` environment variable in web app — API URL hardcoded in every page" \
  --label "bug,Stellar Wave" \
  --body "## Problem
Issue #39 tracks the hardcoded \`http://localhost:3001\` API URL. This issue covers the fix: introducing a \`NEXT_PUBLIC_API_URL\` environment variable so the web app can be deployed to staging and production without code changes.

## Location
- \`apps/web/src/app/patients/page.tsx\` line 18
- \`apps/web/src/app/encounters/page.tsx\` line 19
- \`apps/web/src/app/payments/page.tsx\` line 19

## Tasks
- [ ] Add \`NEXT_PUBLIC_API_URL=http://localhost:3001\` to \`.env.example\`
- [ ] Create \`apps/web/src/lib/api.ts\` exporting \`const API_URL = process.env.NEXT_PUBLIC_API_URL\`
- [ ] Replace all hardcoded URLs in page files with \`\${API_URL}\`
- [ ] Add \`NEXT_PUBLIC_API_URL\` to \`apps/web/.env.example\`

## Acceptance Criteria
- [ ] No hardcoded \`localhost:3001\` in any web source file
- [ ] Setting \`NEXT_PUBLIC_API_URL=https://api.example.com\` routes all requests correctly
- [ ] Build fails with clear error if \`NEXT_PUBLIC_API_URL\` is not set"

gh issue create \
  --title "Web app has no loading or error state UI — blank screen on API failure" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
All three web pages (\`patients\`, \`encounters\`, \`payments\`) show only \`<p>Loading...</p>\` during fetch and silently render an empty list on error. There is no error message, retry button, or visual feedback when the API is unreachable. Users see a blank table with no explanation.

## Location
- \`apps/web/src/app/patients/page.tsx\`
- \`apps/web/src/app/encounters/page.tsx\`
- \`apps/web/src/app/payments/page.tsx\`

## Tasks
- [ ] Add \`error\` state to each page's \`useState\`
- [ ] On fetch failure, set error message and display it with a \"Retry\" button
- [ ] Add a proper loading skeleton (or at minimum a spinner) instead of plain text
- [ ] Empty list state: show \"No records found\" with a CTA instead of an empty table

## Acceptance Criteria
- [ ] API error shows user-friendly message and retry button
- [ ] Loading state shows visual indicator (not plain text)
- [ ] Empty list shows empty state message"

gh issue create \
  --title "No \`next/link\` used for navigation — full page reloads on every route change" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`apps/web/src/app/page.tsx\` uses plain \`<a href=\"/patients\">\` tags for navigation. In Next.js App Router, navigation between pages should use \`<Link href=\"/patients\">\` from \`next/link\` to enable client-side navigation, prefetching, and scroll restoration. Plain \`<a>\` tags cause full page reloads, losing any in-memory state.

## Location
\`apps/web/src/app/page.tsx\` lines 7–9

## Tasks
- [ ] Replace all \`<a href=\"...\">...\` navigation links with \`<Link href=\"...\">...\` from \`next/link\`
- [ ] Audit all page files for any additional \`<a>\` tags used for internal navigation
- [ ] Keep \`<a>\` only for external links (e.g. Stellar explorer links in payments page)

## Acceptance Criteria
- [ ] Internal navigation uses \`next/link\` throughout
- [ ] No full page reload when navigating between \`/patients\`, \`/encounters\`, \`/payments\`
- [ ] External links (Stellar explorer) still use \`<a target=\"_blank\" rel=\"noopener noreferrer\">\`"

gh issue create \
  --title "No \`layout.tsx\` navigation sidebar — each page is isolated with no shared navigation" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`apps/web/src/app/layout.tsx\` renders only \`{children}\` with a basic HTML shell. There is no shared navigation sidebar or top bar. Users must manually type URLs to navigate between modules. A real EMR requires persistent navigation.

## Location
\`apps/web/src/app/layout.tsx\`

## Tasks
- [ ] Add a sidebar navigation component to \`layout.tsx\` with links to: Dashboard (/), Patients (/patients), Encounters (/encounters), Payments (/payments)
- [ ] Highlight the active route using \`usePathname()\` from \`next/navigation\`
- [ ] Add a top bar with app name and a placeholder user avatar
- [ ] Make layout responsive: sidebar collapses to bottom nav on mobile

## Acceptance Criteria
- [ ] Sidebar visible on all pages
- [ ] Active route highlighted in sidebar
- [ ] Layout renders correctly on mobile (≥ 320px width)"

gh issue create \
  --title "No \`<title>\` or \`<meta>\` tags in web app — poor SEO and browser tab shows default Next.js title" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
\`apps/web/src/app/layout.tsx\` has no \`metadata\` export. Browser tabs show the default Next.js title. In a healthcare application, meaningful page titles are important for accessibility (screen readers announce the page title on navigation) and for browser history usability.

## Location
\`apps/web/src/app/layout.tsx\`
All page files under \`apps/web/src/app/\`

## Tasks
- [ ] Add \`export const metadata: Metadata = { title: 'Health Watchers', description: '...' }\` to \`layout.tsx\`
- [ ] Add per-page \`metadata\` exports: \`Patients | Health Watchers\`, \`Encounters | Health Watchers\`, \`Payments | Health Watchers\`
- [ ] Add \`<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\` if not already present via Next.js defaults

## Acceptance Criteria
- [ ] Browser tab shows \`Patients | Health Watchers\` on the patients page
- [ ] \`<meta name=\"description\">\` present on all pages
- [ ] Lighthouse SEO score ≥ 90"

gh issue create \
  --title "No Tailwind CSS — web app uses inline styles throughout, no design system" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
All web pages use inline \`style={{ ... }}\` objects. This approach:
1. Cannot be overridden by themes or dark mode
2. Is not responsive (no media queries)
3. Produces larger HTML payloads
4. Makes consistent spacing and color impossible to enforce
The project README references a design system (issues #86–#92) that requires Tailwind CSS as its implementation layer.

## Location
All files under \`apps/web/src/app/\`

## Tasks
- [ ] Install \`tailwindcss\`, \`postcss\`, \`autoprefixer\` in \`apps/web\`
- [ ] Run \`npx tailwindcss init -p\` and configure \`content\` paths
- [ ] Create \`tailwind.config.ts\` with design tokens (colors, fonts, spacing) matching the design system
- [ ] Add \`@tailwind base/components/utilities\` to global CSS
- [ ] Replace all inline styles in page files with Tailwind utility classes

## Acceptance Criteria
- [ ] No inline \`style={{}}\` objects in any web component
- [ ] \`tailwind.config.ts\` defines brand color tokens
- [ ] Build output CSS is purged (no unused classes in production)"

gh issue create \
  --title "No \`middleware.ts\` in Next.js app — unauthenticated users can access all pages" \
  --label "security,Stellar Wave" \
  --body "## Problem
Issue #40 tracks missing authentication in the web app. This issue covers the Next.js middleware layer specifically. Without \`middleware.ts\`, there is no route-level protection — any user who navigates to \`/patients\` without a token sees the page (which then fails to load data, but the page itself is accessible).

## Location
\`apps/web/src/\` (file missing)

## Tasks
- [ ] Create \`apps/web/src/middleware.ts\` using Next.js \`NextResponse\`
- [ ] Check for \`accessToken\` cookie on all routes except \`/login\` and \`/api/*\`
- [ ] Redirect unauthenticated users to \`/login\`
- [ ] Redirect authenticated users away from \`/login\` to \`/\`
- [ ] Create stub \`apps/web/src/app/login/page.tsx\` login page

## Acceptance Criteria
- [ ] Navigating to \`/patients\` without a token redirects to \`/login\`
- [ ] Authenticated users visiting \`/login\` are redirected to \`/\`
- [ ] \`/api/*\` routes are not intercepted by middleware"

gh issue create \
  --title "No \`react-query\` or SWR — no data caching, refetching, or loading state management" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
All three web pages use raw \`useEffect\` + \`fetch\` with manual \`useState\` for loading/error/data. This approach:
1. Refetches on every component mount (no caching)
2. Has no automatic retry on network failure
3. Has no background refetch to keep data fresh
4. Duplicates boilerplate across every page
Issue #46 tracks global state management; this issue specifically covers server state with React Query.

## Location
All page files under \`apps/web/src/app/\`

## Tasks
- [ ] Install \`@tanstack/react-query\` in \`apps/web\`
- [ ] Add \`QueryClientProvider\` to \`layout.tsx\`
- [ ] Create \`apps/web/src/lib/queries/\` with typed query hooks: \`usePatients\`, \`useEncounters\`, \`usePayments\`
- [ ] Replace \`useEffect\`/\`fetch\` in all pages with query hooks
- [ ] Configure stale time (30s) and retry (2 attempts)

## Acceptance Criteria
- [ ] Navigating away and back to \`/patients\` uses cached data (no loading flash)
- [ ] Network failure triggers automatic retry
- [ ] All pages use query hooks instead of raw \`useEffect\`"

gh issue create \
  --title "No \`zod\` validation on web forms — invalid data sent directly to API" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
There are currently no forms in the web app (issue #43 tracks this), but when forms are added they must validate client-side before sending to the API. Without Zod + React Hook Form, invalid data (empty required fields, wrong date formats, invalid Stellar addresses) will be sent to the API and return cryptic 400 errors.

## Tasks
- [ ] Install \`react-hook-form\` and \`@hookform/resolvers\` in \`apps/web\`
- [ ] Reuse \`PatientSchema\` from \`@health-watchers/types\` as the Zod resolver for the create patient form
- [ ] Show inline field-level error messages below each input
- [ ] Disable submit button while form is submitting
- [ ] Show success toast and close slide-over on successful submission

## Acceptance Criteria
- [ ] Submitting empty create-patient form shows per-field error messages
- [ ] Form uses \`PatientSchema\` from shared types package (single source of truth)
- [ ] Submit button disabled during API call"

gh issue create \
  --title "No \`STELLAR_PORT\` in \`.env.example\` — stellar service port not documented" \
  --label "chore,Stellar Wave" \
  --body "## Problem
\`apps/stellar-service/src/index.ts\` reads \`process.env.STELLAR_PORT || 3002\` but \`.env.example\` does not document this variable. Developers setting up the project for the first time will not know the stellar service runs on a different port from the API, leading to confusion when the API tries to call the stellar service.

## Location
\`apps/stellar-service/src/index.ts\` last line
\`.env.example\`

## Tasks
- [ ] Add \`STELLAR_PORT=3002\` to \`.env.example\` with a comment explaining it is the stellar microservice port
- [ ] Add \`STELLAR_SERVICE_URL=http://localhost:3002\` to \`.env.example\` so the API knows where to call the stellar service
- [ ] Add \`STELLAR_SERVICE_URL\` to \`packages/config/index.ts\`
- [ ] Update \`payments.controller.ts\` to use \`config.stellarServiceUrl\` instead of any hardcoded URL

## Acceptance Criteria
- [ ] \`.env.example\` documents all stellar service environment variables
- [ ] API uses \`config.stellarServiceUrl\` to call stellar service
- [ ] No hardcoded \`localhost:3002\` in source code"

gh issue create \
  --title "No \`MONGO_URI\` validation — API starts silently with empty connection string" \
  --label "bug,Stellar Wave" \
  --body "## Problem
\`packages/config/index.ts\` sets \`mongoUri: process.env.MONGO_URI || ''\`. If \`MONGO_URI\` is not set, the config exports an empty string. The API starts without error, but every database operation fails with a Mongoose buffering timeout. The failure is silent and confusing — the server appears healthy but all data endpoints return 500.

## Location
\`packages/config/index.ts\` line 10

## Fix
- Validate required environment variables on startup (related to issue #24)
- Specifically: throw immediately if \`MONGO_URI\` is empty string
- Use \`zod\` to parse \`process.env\` in config and throw descriptive errors for missing required vars

## Acceptance Criteria
- [ ] API process exits with code 1 and message \`MONGO_URI is required\` if env var not set
- [ ] \`JWT_SECRET\` and \`STELLAR_SECRET_KEY\` similarly validated as required
- [ ] \`GEMINI_API_KEY\` validated as required when AI module is enabled"

gh issue create \
  --title "No \`docker-compose.yml\` — MongoDB must be installed locally, blocking new developer onboarding" \
  --label "enhancement,Stellar Wave" \
  --body "## Problem
Issue #55 tracks Docker containerization for the app itself. This issue specifically covers the development dependency: MongoDB. New developers must install and configure MongoDB locally before they can run the API. A \`docker-compose.yml\` with a MongoDB service would eliminate this friction.

## Tasks
- [ ] Create \`docker-compose.yml\` at repo root with:
  - \`mongo\` service: \`mongo:7\` image, port \`27017:27017\`, named volume for data persistence
  - \`mongo-express\` service (optional): web UI for DB inspection on port 8081
- [ ] Add \`MONGO_URI=mongodb://localhost:27017/health_watchers\` as default in \`.env.example\`
- [ ] Document \`docker-compose up -d\` in \`README.md\` Quick Start section
- [ ] Add \`docker-compose.yml\` volumes to \`.gitignore\`

## Acceptance Criteria
- [ ] \`docker-compose up -d\` starts MongoDB without any local MongoDB installation
- [ ] API connects to containerized MongoDB using default \`.env.example\` values
- [ ] \`README.md\` Quick Start updated with Docker prerequisite"

gh issue create \
  --title "No \`apps/api\` \`package.json\` \`start\` script — cannot run compiled API in production" \
  --label "chore,Stellar Wave" \
  --body "## Problem
\`apps/api/package.json\` has a \`dev\` script (using \`ts-node\` or \`tsx\`) but no \`start\` script to run the compiled JavaScript output. In production, \`ts-node\` should not be used — the TypeScript must be compiled to JS first and then run with \`node dist/app.js\`. Without a \`start\` script, production deployment is undefined.

## Location
\`apps/api/package.json\`
\`apps/stellar-service/package.json\`

## Tasks
- [ ] Add \`\"build\": \"tsc\"\` script to \`apps/api/package.json\`
- [ ] Add \`\"start\": \"node dist/app.js\"\` script
- [ ] Ensure \`tsconfig.json\` has \`outDir: \"dist\"\` and \`rootDir: \"src\"\`
- [ ] Repeat for \`apps/stellar-service/package.json\`
- [ ] Update \`turbo.json\` \`build\` task to include both apps

## Acceptance Criteria
- [ ] \`npm run build\` in \`apps/api\` produces \`dist/\` directory
- [ ] \`npm start\` in \`apps/api\` runs compiled JS without \`ts-node\`
- [ ] \`turbo build\` builds all apps in correct dependency order"
