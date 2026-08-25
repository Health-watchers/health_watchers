# Testing Guide

This guide covers the testing strategy, tooling, setup, and conventions for the Health Watchers platform.

---

## Table of Contents

- [Test Stack](#test-stack)
- [Test Setup](#test-setup)
  - [Prerequisites](#prerequisites)
  - [Installing Dependencies](#installing-dependencies)
  - [Environment Variables](#environment-variables)
  - [Starting Servers for E2E Tests](#starting-servers-for-e2e-tests)
- [Running Tests](#running-tests)
- [Test Examples](#test-examples)
  - [API Unit Test](#api-unit-test)
  - [API Integration Test](#api-integration-test)
  - [Frontend Component Test](#frontend-component-test)
  - [E2E Test](#e2e-test)
  - [Visual Regression Test](#visual-regression-test)
  - [Contract Test](#contract-test)
- [Coverage Targets](#coverage-targets)
- [CI Testing](#ci-testing)
- [Writing New Tests](#writing-new-tests)
- [Page Objects](#page-objects)

---

## Test Stack

| Layer | Tool | Location | Purpose |
|-------|------|----------|---------|
| API unit & integration | Jest + Supertest | `apps/api/src/__tests__/` | Service logic, route handlers, middleware |
| Frontend unit | Jest + Testing Library | `apps/web/src/**/__tests__/` | React components, hooks, utility functions |
| E2E | Playwright | `apps/web/e2e/` | Full user flows across the browser |
| Visual regression | Playwright (`toHaveScreenshot`) | `apps/web/e2e/` | UI consistency across changes |
| Accessibility | Playwright + axe | `apps/web/tests/accessibility.spec.ts` | WCAG 2.1 compliance |
| Contract | Pact | `apps/api/src/contracts/`, `apps/web/src/contracts/` | API consumer-provider contracts |
| Mutation | Stryker | `apps/api/` | Test suite quality |
| Performance | k6 | `k6/` | Load, stress, and spike testing |

---

## Test Setup

### Prerequisites

- Node.js 20 (see `.nvmrc`; use `nvm use` to switch automatically)
- MongoDB 7 running locally or via Docker Compose
- All workspace dependencies installed

### Installing Dependencies

```bash
# Install all dependencies across the monorepo
npm ci
```

### Environment Variables

#### API Tests

Copy `.env.example` to `.env` and set at minimum:

```bash
cp .env.example .env
```

Required variables for API tests:

```env
JWT_ACCESS_TOKEN_SECRET=test-access-secret-32-chars-long!!
JWT_REFRESH_TOKEN_SECRET=test-refresh-secret-32-chars-long!
MONGO_URI=mongodb://localhost:27017/health_watchers_test
NODE_ENV=test
API_PORT=3001
```

Start MongoDB before running API tests:

```bash
# Via Docker Compose (recommended — no local install needed)
docker-compose -f docker-compose.dev.yml up -d

# Or start a local mongod instance
mongod --dbpath /data/db
```

#### E2E Tests

```env
PLAYWRIGHT_BASE_URL=http://localhost:3000
E2E_DOCTOR_EMAIL=doctor@example.com
E2E_DOCTOR_PASSWORD=Password123!
E2E_ADMIN_EMAIL=admin@example.com
E2E_ADMIN_PASSWORD=Password123!
```

### Starting Servers for E2E Tests

E2E tests require both the API and web servers to be running. Start them in separate terminals:

```bash
# Terminal 1 — API server (port 3001)
npm run dev --workspace=api

# Terminal 2 — Web server (port 3000)
npm run dev --workspace=web

# Terminal 3 — Wait for servers to be ready, then run tests
npx wait-on http://localhost:3001/health http://localhost:3000
npm run test:e2e --workspace=web
```

---

## Running Tests

```bash
# Run all unit + integration tests across the monorepo
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode (re-runs on file change)
npm run test:watch

# API tests only
npm test --workspace=api

# API tests with coverage
npm run test:coverage --workspace=api

# Web unit tests only
npm test --workspace=web

# E2E tests (requires running servers — see above)
npm run test:e2e --workspace=web

# E2E tests with interactive Playwright UI
npm run test:e2e:ui --workspace=web

# E2E tests for a specific spec file
npx playwright test apps/web/e2e/auth.spec.ts --workspace=web

# Accessibility tests
npx playwright test apps/web/tests/accessibility.spec.ts

# Mutation tests (slow — run before merging critical changes)
npm run test:mutation --workspace=api

# Performance / load tests (requires running API)
cd k6 && k6 run load-test.js
```

---

## Test Examples

### API Unit Test

Unit tests live alongside the module they test as `*.test.ts` or inside `__tests__/`. Use Jest mocks for dependencies.

```typescript
// apps/api/src/modules/auth/__tests__/auth.service.test.ts
import { AuthService } from '../auth.service';
import { UserModel } from '../../users/user.model';

jest.mock('../../users/user.model');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  it('hashes the password on registration', async () => {
    const mockUser = { email: 'test@example.com', password: 'hashed' };
    (UserModel.create as jest.Mock).mockResolvedValue(mockUser);

    const user = await authService.register({
      email: 'test@example.com',
      password: 'Password123!',
      fullName: 'Test User',
      clinicId: '60c72b2f9b1d8e1a4c8d0001',
      role: 'NURSE',
    });

    expect(user.password).not.toBe('Password123!');
  });

  it('returns null when credentials are invalid', async () => {
    (UserModel.findOne as jest.Mock).mockResolvedValue(null);

    const result = await authService.validateCredentials('bad@example.com', 'wrong');
    expect(result).toBeNull();
  });
});
```

### API Integration Test

Integration tests use Supertest to fire real HTTP requests against the Express app with a live test database.

```typescript
// apps/api/src/__tests__/auth.integration.test.ts
import request from 'supertest';
import app from '../app';
import { connectDB, disconnectDB } from '../config/db';
import { UserModel } from '../modules/users/user.model';

beforeAll(async () => {
  await connectDB();
  // Seed a test user
  await UserModel.create({
    email: 'doctor@example.com',
    password: await bcrypt.hash('Password123!', 12),
    fullName: 'Test Doctor',
    role: 'DOCTOR',
    clinicId: '60c72b2f9b1d8e1a4c8d0001',
    isActive: true,
    emailVerified: true,
  });
});

afterAll(async () => {
  await UserModel.deleteMany({});
  await disconnectDB();
});

describe('POST /api/v1/auth/login', () => {
  it('returns access and refresh tokens on valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 401 on invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'doctor@example.com', password: 'WrongPassword' });

    expect(res.status).toBe(401);
  });

  it('returns 429 after exceeding the rate limit', async () => {
    // Hit the limit (5 per 15 min per IP)
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'x@x.com', password: 'wrong' });
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'x@x.com', password: 'wrong' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('TooManyRequests');
  });
});
```

### Frontend Component Test

Frontend unit tests use Jest with React Testing Library. Tests are co-located next to the component.

```typescript
// apps/web/src/components/PatientCard/__tests__/PatientCard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientCard } from '../PatientCard';

const mockPatient = {
  _id: '60c72b2f9b1d8e1a4c8d0001',
  firstName: 'Jane',
  lastName: 'Doe',
  systemId: 'PAT-000001',
  riskLevel: 'low' as const,
};

describe('PatientCard', () => {
  it('renders the patient full name', () => {
    render(<PatientCard patient={mockPatient} />);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('calls onSelect when the card is clicked', async () => {
    const handleSelect = jest.fn();
    render(<PatientCard patient={mockPatient} onSelect={handleSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /jane doe/i }));
    expect(handleSelect).toHaveBeenCalledWith(mockPatient._id);
  });

  it('shows the risk level badge', () => {
    render(<PatientCard patient={mockPatient} />);
    expect(screen.getByText('low')).toBeInTheDocument();
  });
});
```

### E2E Test

E2E tests use Playwright and must follow the Page Object pattern for any route with more than one interaction.

```typescript
// apps/web/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('Authentication', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(
      process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com',
      process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!'
    );

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('invalid credentials show an error message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('invalid@example.com', 'wrongpassword');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
```

### Visual Regression Test

Visual regression tests compare screenshots against committed baselines. Baseline images are stored in `apps/web/e2e/`.

```typescript
// apps/web/e2e/visual-regression.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('login page matches baseline', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test('dashboard matches baseline', async ({ page }) => {
    // Log in first
    await page.goto('/login');
    await page.fill('[name=email]', process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com');
    await page.fill('[name=password]', process.env.E2E_DOCTOR_PASSWORD ?? 'Password123!');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/dashboard/);

    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
  });
});
```

To update baselines after an intentional UI change:

```bash
npx playwright test --update-snapshots
# commit the updated *.png files
```

### Contract Test

Consumer-driven contract tests use [Pact](https://pact.io/) to verify the API contract between the web frontend and the API.

```typescript
// apps/web/src/contracts/patients.pact.spec.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import path from 'path';

const provider = new PactV3({
  consumer: 'web',
  provider: 'api',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('Patients API Contract', () => {
  it('lists patients', () => {
    return provider
      .addInteraction({
        states: [{ description: 'clinic has patients' }],
        uponReceiving: 'a request for the patient list',
        withRequest: {
          method: 'GET',
          path: '/api/v1/patients',
          headers: { Authorization: MatchersV3.string('Bearer token') },
        },
        willRespondWith: {
          status: 200,
          body: {
            success: true,
            data: MatchersV3.eachLike({
              _id: MatchersV3.string('60c72b2f9b1d8e1a4c8d0001'),
              firstName: MatchersV3.string('Jane'),
              lastName: MatchersV3.string('Doe'),
            }),
          },
        },
      })
      .executeTest(async (mockProvider) => {
        const res = await fetch(`${mockProvider.url}/api/v1/patients`, {
          headers: { Authorization: 'Bearer token' },
        });
        expect(res.status).toBe(200);
      });
  });
});
```

---

## Coverage Targets

Coverage is measured with Jest's built-in coverage reporter and uploaded to [Codecov](https://codecov.io) on every CI run.

| Package | Line Target | Branch Target |
|---------|------------|--------------|
| `api` | 80% | 75% |
| `stellar-service` | 75% | 70% |
| `web` (unit tests) | 70% | 65% |

Run coverage locally:

```bash
# API coverage
npm run test:coverage --workspace=api

# Opens HTML report in browser (after running coverage)
open apps/api/coverage/lcov-report/index.html
```

CI enforces these targets. Pull requests that reduce coverage below the threshold will fail the `test` job.

---

## CI Testing

Tests run automatically on every push and pull request via `.github/workflows/ci.yml`.

### Pipeline Stages

| Stage | Jobs | Trigger |
|-------|------|---------|
| 0 — Lint | `actionlint` | Always |
| 1 — Quality | `typecheck`, `lint`, `format` | After stage 0 |
| 2 — Security | `npm audit`, `license-checker`, `snyk` | Parallel with stage 1 |
| 3 — Test | API unit + integration + coverage | After stage 1 and 2 |
| 4 — Build | `web`, `api`, `stellar-service` | After stage 3 |
| 5 — E2E | Full Playwright suite | After stage 4 |
| 6 — Deploy | Staging → Production | `main` branch only |

### Stage 3 Detail — Test Job

The CI `test` job performs the following steps in order:

1. Starts a MongoDB service container (`mongo:7`).
2. Runs database migrations: `npm run migrate:up --workspace=api`.
3. Seeds test data.
4. Runs unit and integration tests: `npm test --workspace=api`.
5. Generates a coverage report and uploads it to Codecov.
6. Runs mutation tests (Stryker) on the API module.

### Stage 5 Detail — E2E Job

The E2E job:

1. Builds production-mode API and web images from stage 4.
2. Starts all services (API, web, MongoDB) using Docker Compose.
3. Waits for health checks to pass.
4. Runs all Playwright specs: `npm run test:e2e --workspace=web`.
5. Uploads artifacts (retained for 7 days):
   - `playwright-report/` — HTML report with screenshots and traces.
   - `test-results/` — Video recordings for failed tests.

### Required GitHub Secrets for E2E

| Secret | Description |
|--------|-------------|
| `E2E_DOCTOR_EMAIL` | Doctor test account email |
| `E2E_DOCTOR_PASSWORD` | Doctor test account password |
| `E2E_ADMIN_EMAIL` | Admin test account email |
| `E2E_ADMIN_PASSWORD` | Admin test account password |

These must be configured in the GitHub repository settings under **Settings → Secrets and variables → Actions**.

### Downloading CI Artifacts

When a CI run fails, download the Playwright report to investigate:

1. Go to the failing workflow run in GitHub Actions.
2. Scroll to **Artifacts** at the bottom.
3. Download `playwright-report`.
4. Open `index.html` locally to view screenshots, traces, and video recordings.

---

## Writing New Tests

1. **Unit/integration tests** — place alongside the module as `*.test.ts` or inside `__tests__/`. Match the directory structure of the source file.

2. **E2E tests** — add a new `*.spec.ts` in `apps/web/e2e/`. Name it after the feature area (e.g. `appointment-flow.spec.ts`, `payment-flow.spec.ts`).

3. **Use page objects** — any route with more than one test interaction should have a page object in `apps/web/e2e/pages/`. Never put selectors in spec bodies.

4. **Use environment variables for credentials** — never hardcode passwords or emails:
   ```typescript
   const email = process.env.E2E_DOCTOR_EMAIL ?? 'doctor@example.com';
   ```

5. **Mock external services** — mock Stellar, AI endpoints, and email sending with `page.route()` to keep tests deterministic and fast:
   ```typescript
   await page.route('**/api/v1/ai/**', (route) =>
     route.fulfill({ json: { data: { summary: 'Mocked summary' } } })
   );
   ```

6. **Tag slow tests** — use `test.slow()` to give long-running tests triple the default timeout:
   ```typescript
   test.slow();
   test('generates a large report', async ({ page }) => { ... });
   ```

7. **Clean up test data** — integration tests must clean up documents they create in `afterEach` or `afterAll` to avoid polluting the test database for subsequent tests.

8. **Keep tests independent** — each test must be able to run in isolation without relying on state left by another test.

---

## Page Objects

E2E tests use the Page Object pattern. Selectors and navigation logic live in `apps/web/e2e/pages/` — never inline in spec files.

| Page Object | Route | Responsibility |
|-------------|-------|---------------|
| `LoginPage` | `/login` | Login form interactions |
| `PatientFormPage` | `/patients/new` | Patient registration form |
| `EncounterFormPage` | Encounter modal | Encounter creation and editing |
| `PaymentPage` | `/payments` | Payment flow |
| `WalletPage` | `/wallet` | Stellar wallet management |

**Example page object:**

```typescript
// apps/web/e2e/pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  private readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```
