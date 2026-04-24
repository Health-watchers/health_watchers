# #326 + #327 — Login/Auth flow & API test suite

## Summary

Two issues addressed in one branch:

- **#326** — Implements the complete JWT authentication flow in the Next.js frontend: login page, auth context with token refresh, protected routes, and authenticated API calls.
- **#327** — Sets up Jest for the API with TypeScript support and adds comprehensive unit + integration tests for the auth module.

---

## #326 — Frontend authentication flow

### What changed

**`AuthContext` (`src/context/AuthContext.tsx`)**
- Added `login(email, password)` method — calls `/api/auth/login`, handles MFA detection, fetches user profile on success, starts the auto-refresh timer
- Added `logout()` method — clears the refresh timer, calls `/api/auth/logout` to invalidate the backend refresh token, clears user state, redirects to `/login`
- Added `refreshToken()` method for manual refresh
- Added **auto-refresh timer** — fires 14 minutes after login (1 min before the 15-min access token expires), reschedules itself on success, calls `logout()` on failure

**Login page (`src/app/(auth)/login/page.tsx`)**
- Now uses `useAuth().login()` instead of a raw `fetch`
- Correctly detects `status === 'mfa_required'` from the API response
- Stores `tempToken` in `sessionStorage` before redirecting to `/mfa`

**MFA page (`src/app/(auth)/mfa/page.tsx`)**
- Reads `tempToken` from `sessionStorage`; redirects to `/login` if missing (guards against direct navigation)
- Sends `{ tempToken, totp }` to the correct `/api/auth/mfa/challenge` endpoint

**New: `/api/auth/mfa/challenge` route**
- Proxies to the backend's `/auth/mfa/challenge` endpoint and sets httpOnly cookies on success

**`/api/auth/logout` route**
- Now reads the `refreshToken` cookie and calls the backend to invalidate it before clearing cookies (previously only cleared cookies client-side)

**`src/lib/auth.ts`**
- Cleaned up unused import; added `window` guard for SSR safety in `fetchWithAuth`

**Query hooks** (`usePatients`, `useEncounters`, `usePayments`)
- Switched from plain `fetch` to `fetchWithAuth`, which automatically retries with a refreshed token on 401 and redirects to `/login` on refresh failure

**`EncountersClient` and `PaymentsClient`**
- All mutation fetches (`POST /encounters`, `POST /payments/intent`, `POST /payments/:id/confirm`) now use `fetchWithAuth`

**Dashboard page**
- `fetchDashboard` now uses `fetchWithAuth`

**`ProtectedRoute` component (`src/components/ProtectedRoute.tsx`)** — new
- Client-side auth guard with loading spinner; redirects to `/login` if unauthenticated
- Wraps the dashboard layout as a second layer of protection alongside the middleware

**Dashboard layout**
- Wrapped with `<ProtectedRoute>` for client-side protection

**`TopBar`**
- Uses `useAuth().logout()` instead of its own inline implementation

**`middleware.ts`**
- Added `/` (dashboard root) to protected routes
- Added `/mfa`, `/forgot-password`, `/reset-password` to public routes

---

## #327 — API test suite

### What changed

**`apps/api/jest.config.ts`** — new
- `ts-jest` with `isolatedModules: true` (transpile-only, avoids type errors from optional dynamic imports like `redis`)
- `@api/*` and `@/*` path alias resolution
- `moduleNameMapper` mocks for `pino-http` and the rate-limit middleware (no Redis or real pino logger needed in tests)
- `modulePaths` for monorepo dependency resolution
- `setupFiles` pointing to `src/test-setup.ts` for env var injection
- `forceExit: true` to prevent open handles from hanging the process
- Coverage collection from `src/modules/auth/**/*.ts` with 80% line/branch thresholds

**`apps/api/package.json`**
- `npm test` — runs Jest (`jest --passWithNoTests`)
- `npm run test:coverage` — runs with coverage report
- `npm run test:watch` — watch mode

**New: `src/modules/auth/auth.routes.test.ts`** — 22 integration tests
- `POST /api/v1/auth/login`: valid credentials (tokens returned, no password in response, refresh token stored in DB), wrong password (counter incremented, account locked after 5 attempts), non-existent email, inactive user, locked account (423 + Retry-After header), all validation errors (missing email, invalid format, missing password, empty body), MFA flow (tempToken returned), timing-safe error messages
- `POST /api/v1/auth/refresh`: valid rotation (old token consumed, new token issued, family preserved), invalid token string, JTI not in DB, expired token, access-token-as-refresh-token, replay attack (family revoked), missing field

**Fixed: `src/modules/auth/change-password.test.ts`**
- Rewritten to test the actual `POST /api/v1/users/me/password` route (was testing a non-existent `PATCH /api/v1/auth/me/password` route)
- Corrected request body schema (no `confirmPassword`, no complexity rules beyond min 8 chars)
- Added rate-limit mock so tests aren't blocked by the auth limiter

**Fixed: `src/modules/auth/password-reset.test.ts`**
- Fixed TypeScript type error on `resetPasswordExpiresAt` (`never` type inference)

**New mock files**
- `src/__mocks__/pino-http.ts` — no-op Express middleware
- `src/middlewares/__mocks__/rate-limit.middleware.ts` — pass-through limiters
- `src/test-setup.ts` — sets required env vars before any test file runs

**`.github/workflows/ci.yml`**
- Updated `npm test` command to `npm test --workspace=apps/api`
- Updated JWT secrets to meet the 32-character minimum required by the API
- Removed the MongoDB service container (all tests use mocks, no real DB needed)

**Root `package.json` / `package-lock.json`**
- Added `color-convert`, `delayed-stream`, `escape-html`, `fresh`, `ipaddr.js` as dev deps to fix monorepo hoisting issues where Jest couldn't resolve express transitive dependencies

---

## Test results

```
Test Suites: 9 passed, 9 total
Tests:       95 passed, 95 total
Time:        ~10s
```

## What was tested

- Login with valid credentials → tokens returned, no sensitive fields in response
- Login with wrong password → 401, counter incremented, account locked after 5 failures
- Login with locked account → 423 with `Retry-After` header
- Login validation → 400 for missing/invalid fields
- MFA login flow → `mfa_required` status + `tempToken`
- Token refresh rotation → old JTI consumed, new JTI issued, family preserved
- Replay attack detection → entire family revoked on consumed token reuse
- Expired/invalid/wrong-type tokens → 401
- Change password → auth required, validation, wrong current password, success
- Token service unit tests → sign/verify access, refresh, temp tokens; issuer/audience enforcement; token confusion prevention
