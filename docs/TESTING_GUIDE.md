# Testing Guide

This guide covers the testing strategy, setup, and conventions for the Health Watchers platform.

## Test Stack

| Layer | Tool | Location |
|---|---|---|
| Unit & Integration | Jest | `apps/api/src/__tests__/` |
| Frontend Unit | Jest + Testing Library | `apps/web/src/**/__tests__/` |
| E2E | Playwright | `apps/web/e2e/` |
| Performance | k6 | `k6/` |

## Setup

### Prerequisites

- Node.js 20 (see `.nvmrc`)
- MongoDB 7 running locally (or use Docker Compose)
- All dependencies installed: `npm ci`

### Running Tests

```bash
# All unit + integration tests across the monorepo
npm test

# API tests only
npm test --workspace=api

# Web unit tests only
npm test --workspace=web

# E2E tests (requires running servers — see below)
npm run test:e2e --workspace=web

# E2E tests with interactive UI
npm run test:e2e:ui --workspace=web
```

### Environment Variables for API Tests

Copy `.env.example` to `.env` and set at minimum:

```
JWT_ACCESS_TOKEN_SECRET=test-access-secret-32-chars-long!!
JWT_REFRESH_TOKEN_SECRET=test-refresh-secret-32-chars-long!
MONGO_URI=mongodb://localhost:27017/health_watchers_test
NODE_ENV=test
API_PORT=3001
```

### Environment Variables for E2E Tests

```
PLAYWRIGHT_BASE_URL=http://localhost:3000
E2E_DOCTOR_EMAIL=doctor@example.com
E2E_DOCTOR_PASSWORD=Password123!
E2E_ADMIN_EMAIL=admin@example.com
E2E_ADMIN_PASSWORD=Password123!
```

### Starting Servers for E2E

```bash
# Terminal 1 — API
npm run dev --workspace=api

# Terminal 2 — Web
npm run dev --workspace=web

# Terminal 3 — run tests once servers are ready
npx wait-on http://localhost:3001/health http://localhost:3000
npm run test:e2e --workspace=web
```

---

## Test Examples

### API Unit Test (Jest)

```typescript
describe('AuthService', () => {
  it('hashes the password on registration', async () => {
    const user = await authService.register({
      email: 'test@example.com',
      password: 'Password123!',
    });
    expect(user.password).not.toBe('Password123!');
  });
});
```

### API Integration Test (Jest + Supertest)

```typescript
describe('POST /api/v1/auth/login', () => {
  it('returns access and refresh tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });
});
```

### E2E Test (Playwright)

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test('successful login redirects to dashboard', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('doctor@example.com', 'Password123!');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole('navigation')).toBeVisible();
});
```

### Visual Regression Test (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test('login page matches visual snapshot', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveScreenshot('login.png', { fullPage: true });
});
```

---

## Coverage Targets

| Package | Line Target | Branch Target |
|---|---|---|
| `api` | 80% | 75% |
| `stellar-service` | 75% | 70% |
| `web` (unit) | 70% | 65% |

Run coverage locally:

```bash
npm run test:coverage --workspace=api
```

Coverage reports are uploaded to [Codecov](https://codecov.io) on every CI run (see `.github/workflows/ci.yml`, `codecov-umbrella` step).

---

## CI Testing

Tests run automatically on every push and pull request via `.github/workflows/ci.yml`.

### Pipeline Stages

| Stage | Jobs | Triggers |
|---|---|---|
| 0 — Lint | `actionlint` | always |
| 1 — Quality | `typecheck`, `lint`, `format` | after stage 0 |
| 2 — Security | `npm audit`, `license-checker`, `snyk` | parallel |
| 3 — Test | API unit + integration + coverage | after stage 1 & 2 |
| 4 — Build | `web`, `api`, `stellar-service` | after stage 3 |
| 5 — E2E | Full Playwright suite | after build |
| 6 — Deploy | Staging → Production | `main` branch only |

### E2E in CI

The CI spins up a MongoDB service container, starts the API and web servers, seeds test data, then runs all Playwright specs. Artifacts retained for 7 days:

- `playwright-report/` — HTML report with screenshots and traces
- `test-results/` — video recordings on failure

### Updating Visual Snapshots

When an intentional UI change breaks a visual test, update the baselines locally and commit the new files:

```bash
npx playwright test --update-snapshots
# commit the updated *.png files in apps/web/e2e/
```

---

## Page Objects

E2E tests use the Page Object pattern. Selectors live in `apps/web/e2e/pages/` — never in spec bodies.

| Page Object | Route |
|---|---|
| `LoginPage` | `/login` |
| `PatientFormPage` | `/patients/new` |
| `EncounterFormPage` | encounter modal |
| `PaymentPage` | `/payments` |
| `WalletPage` | `/wallet` |

---

## Writing New Tests

1. **Unit/integration tests**: place alongside the module as `*.test.ts` or inside `__tests__/`.
2. **E2E tests**: add a new `*.spec.ts` file in `apps/web/e2e/`. Name it after the feature area (`appointment-flow.spec.ts`).
3. **Use page objects** for any route with more than one test interaction.
4. **Use environment variables** for credentials (`process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com'`).
5. **Mock external services** (Stellar, AI) with `page.route()` to keep tests deterministic.
6. **Tag slow tests** with `test.slow()` so they get a longer timeout automatically.
