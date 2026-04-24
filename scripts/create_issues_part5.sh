#!/bin/bash
REPO="Health-watchers/health_watchers"

gh issue create --repo "$REPO" \
  --title "No request ID / correlation ID for distributed tracing" \
  --label "enhancement" \
  --body "**Branch:** \`feat/request-correlation-id\`
**Timeframe:** 1 day

## Description
When a request flows through the web app → API → stellar-service, there is no shared identifier to correlate log entries across services. Debugging a failed payment requires manually correlating timestamps across three separate log streams.

## Tasks
- Generate a \`requestId\` (UUID v4) for every incoming request using \`pino-http\`'s \`genReqId\` option
- Pass the \`requestId\` as an \`X-Request-ID\` header in all outgoing requests to the stellar-service
- Return \`X-Request-ID\` in all API responses
- Include \`requestId\` in all error responses

## Acceptance Criteria
- Every API response includes an \`X-Request-ID\` header
- Log entries for a single request across API and stellar-service share the same \`requestId\`
- Error responses include \`requestId\`"

gh issue create --repo "$REPO" \
  --title "No database connection pooling configuration" \
  --label "enhancement" \
  --body "**Branch:** \`feat/mongo-connection-pool-config\`
**Timeframe:** 3 hours

## Description
\`mongoose.connect(config.mongoUri)\` is called with no connection pool options. Mongoose's default pool size is 5 connections. Under load, the API will queue requests waiting for a free connection, causing latency spikes.

## Tasks
- Update \`connectDB()\` to pass connection options: \`{ maxPoolSize: 10, minPoolSize: 2, serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 }\`
- Add \`MONGO_MAX_POOL_SIZE\` env var (default: 10)
- Add a \`/health\` endpoint enhancement that includes DB connection state

## Acceptance Criteria
- \`connectDB()\` passes pool size options to \`mongoose.connect()\`
- \`GET /health\` returns \`{ status: 'ok', db: 'connected' }\` when MongoDB is reachable
- Pool size is configurable via env var"

gh issue create --repo "$REPO" \
  --title "No data export / patient data portability" \
  --label "enhancement" \
  --body "**Branch:** \`feat/patient-data-export-hipaa\`
**Timeframe:** 3 days

## Description
HIPAA's Right of Access (45 CFR § 164.524) requires covered entities to provide patients with access to their PHI in a readable format within 30 days of request. There is no data export functionality.

## Tasks
- Implement \`GET /api/v1/patients/:id/export\` that returns a patient's complete record as JSON or PDF
- Implement \`GET /api/v1/clinics/:id/export\` (SUPER_ADMIN only) that exports all clinic data as a ZIP archive
- Add an audit log entry for every data export
- Rate-limit the export endpoint (max 5 exports per hour per clinic)

## Acceptance Criteria
- \`GET /patients/:id/export?format=json\` returns a complete JSON record for the patient
- \`GET /patients/:id/export?format=pdf\` returns a formatted PDF with all patient data
- Every export creates an audit log entry with \`action: 'EXPORT_PATIENT_DATA'\`"

gh issue create --repo "$REPO" \
  --title "API base URL hardcoded as \`http://localhost:3001\` in every page" \
  --label "bug" \
  --body "**Branch:** \`fix/api-base-url-env-var\`
**Timeframe:** 3 hours

## Description
Every web page hardcodes \`http://localhost:3001\` as the API base URL. In staging or production environments, this URL is wrong and every API call will fail.

## Tasks
- Add \`NEXT_PUBLIC_API_URL\` to \`apps/web/.env.example\`
- Create \`apps/web/src/lib/api.ts\` exporting a configured fetch wrapper that uses \`process.env.NEXT_PUBLIC_API_URL\`
- Replace all hardcoded \`http://localhost:3001\` references with the env var
- Add a startup check that warns if \`NEXT_PUBLIC_API_URL\` is not set

## Acceptance Criteria
- No hardcoded \`localhost:3001\` URLs remain in any component
- Setting \`NEXT_PUBLIC_API_URL=https://api.example.com\` causes all API calls to use that URL
- The env var is documented in \`.env.example\` with a description

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No authentication in the web app — all pages are publicly accessible" \
  --label "enhancement" \
  --body "**Branch:** \`feat/web-authentication-flow\`
**Timeframe:** 5 days

## Description
The web app has no login page, no session management, and no route protection. Any user who opens the browser can access the patients, encounters, and payments pages. For a healthcare application, unauthenticated access to any page is a compliance violation.

## Tasks
- Create \`apps/web/src/app/login/page.tsx\` with an email/password form
- On successful login, store the \`accessToken\` in an httpOnly cookie via a Next.js API route
- Create \`apps/web/src/middleware.ts\` using Next.js middleware to check for the auth cookie on all routes except \`/login\`
- Implement token refresh: if the access token is expired, use the refresh token to get a new one silently
- Create a \`POST /api/auth/logout\` Next.js API route that clears the cookies

## Acceptance Criteria
- Navigating to \`/patients\` without being logged in redirects to \`/login\`
- Tokens are stored in httpOnly cookies, not \`localStorage\` or \`sessionStorage\`
- After logout, navigating to any protected page redirects to \`/login\`

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Patient list page maps \`patient.name\` but API returns \`firstName\` and \`lastName\`" \
  --label "bug" \
  --body "**Branch:** \`fix/patient-interface-field-mapping\`
**Timeframe:** 3 hours

## Description
\`patients/page.tsx\` defines \`interface Patient { id: string; name: string; dob: string }\` and renders \`patient.name\`. The API returns \`firstName\`, \`lastName\`, \`dateOfBirth\`, \`systemId\`, and \`sex\`. The table always renders empty cells for every patient.

## Tasks
- Update the \`Patient\` interface to match the actual API response shape
- Update the table columns to display \`systemId\`, \`firstName + ' ' + lastName\`, \`dateOfBirth\` (formatted), \`sex\`, \`contactNumber\`
- Move the \`Patient\` type to \`packages/types/src/index.ts\`
- Add a \`formatDate(isoString: string): string\` utility

## Acceptance Criteria
- The patients table correctly displays \`firstName\`, \`lastName\`, and formatted \`dateOfBirth\` from the API response
- The \`Patient\` type is defined once in \`packages/types\` and imported in both the API and web app

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No error boundary or meaningful error UI in web pages" \
  --label "enhancement" \
  --body "**Branch:** \`feat/error-boundary-ui\`
**Timeframe:** 1 day

## Description
Fetch errors in all three pages are caught and logged to \`console.error\`, but the UI shows nothing — the page just renders an empty list with stub text. A user has no way to know whether the list is empty because there are no records or because an error occurred.

## Tasks
- Add an \`error\` state to each page alongside \`loading\` and \`data\` states
- Display a user-friendly error message when the fetch fails with a retry button
- Create a reusable \`ErrorMessage\` component
- Create an \`ErrorBoundary\` client component and wrap the root layout with it
- Remove all stub text like 'No patients? API stub - implement CRUD.' from the UI

## Acceptance Criteria
- When the API is unreachable, the page displays the \`ErrorMessage\` component with a retry button
- A rendering error in any page is caught by the error boundary and shows a fallback UI

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "No form to create patients, encounters, or payments in the UI" \
  --label "enhancement" \
  --body "**Branch:** \`feat/create-forms-patients-encounters\`
**Timeframe:** 5 days

## Description
All three pages only list data. There are no forms to create new records. The application is read-only from the UI perspective, making it unusable as an EMR.

## Tasks
- Create \`CreatePatientForm.tsx\` with fields: \`firstName\`, \`lastName\`, \`dateOfBirth\`, \`sex\`, \`contactNumber\`, \`address\`
- Create \`CreateEncounterForm.tsx\` with fields: \`patientId\`, \`chiefComplaint\`, \`notes\`
- Create \`CreatePaymentIntentForm.tsx\` with fields: \`patientId\`, \`amount\`
- Add client-side validation using \`react-hook-form\` + \`zod\` resolver
- Show success/error toast notifications after form submission

## Acceptance Criteria
- Submitting the create patient form with valid data creates a patient and refreshes the list
- Submitting with invalid data shows inline validation errors without making an API call
- API errors (e.g. 409 duplicate) are displayed as form-level error messages

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Navigation uses \`<a>\` tags — causes full page reloads" \
  --label "bug" \
  --body "**Branch:** \`fix/replace-anchor-with-next-link\`
**Timeframe:** 2 hours

## Description
\`page.tsx\` uses \`<a href=\"/patients\">\`, \`<a href=\"/encounters\">\`, and \`<a href=\"/payments\">\` for navigation. These are plain HTML anchor tags that trigger full page reloads, bypassing Next.js client-side routing.

## Tasks
- Replace all \`<a href=\"...\">\` navigation links with Next.js \`<Link href=\"...\">\` components
- Create a \`NavBar\` component that uses \`usePathname()\` to highlight the active route
- Add the \`NavBar\` to \`layout.tsx\`
- Ensure the \`NavBar\` includes a logout button

## Acceptance Criteria
- Clicking navigation links does not trigger a full page reload
- The active route is visually highlighted in the nav bar
- The \`NavBar\` is present on all pages except \`/login\`

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."

gh issue create --repo "$REPO" \
  --title "Payments page links to testnet explorer unconditionally" \
  --label "bug" \
  --body "**Branch:** \`fix/stellar-explorer-url-by-network\`
**Timeframe:** 2 hours

## Description
\`payments/page.tsx\` hardcodes \`https://stellar.expert/explorer/testnet/tx/\` in the transaction link. When the app is configured for mainnet, this link points to the wrong explorer and the transaction will not be found.

## Tasks
- Add \`NEXT_PUBLIC_STELLAR_NETWORK\` to \`.env.example\` (values: \`testnet\` or \`mainnet\`)
- Create a utility \`getStellarExplorerUrl(txHash: string, network: string): string\`
- Replace the hardcoded URL in \`payments/page.tsx\` with a call to this utility

## Acceptance Criteria
- With \`NEXT_PUBLIC_STELLAR_NETWORK=mainnet\`, transaction links point to the mainnet explorer
- With \`NEXT_PUBLIC_STELLAR_NETWORK=testnet\`, transaction links point to the testnet explorer
- No hardcoded explorer URLs remain in any component

> 📸 A screenshot **or** 🎥 a screen recording must be attached to the PR for this issue."
