# Complete Testing Guide for Health Watchers Monorepo

Comprehensive testing instructions for each app and testing type in the Health Watchers monorepo.

**Last updated**: 2026-10-17  
**Monorepo structure**: `apps/api`, `apps/web`, `apps/stellar-service`

---

## Quick Reference

| Test Type | Command | Coverage | Location |
|-----------|---------|----------|----------|
| **Unit (API)** | `npm run test:unit` | Controllers, services, utils | `apps/api/src/**/*.test.ts` |
| **Integration (API)** | `npm run test:integration` | Database, routes, auth | `apps/api/src/**/*.integration.ts` |
| **Contract (Pact)** | `npm run test:contract` | Service interactions | `apps/api/src/**/*.contract.ts` |
| **Unit (Web)** | `npm run test:unit` | React components | `apps/web/src/**/*.test.tsx` |
| **E2E (Playwright)** | `npm run test:e2e` | Full user workflows | `e2e/tests/**/*.spec.ts` |
| **A11y (Accessibility)** | `npm run test:a11y` | WCAG 2.1 AA compliance | `e2e/a11y/**/*.spec.ts` |
| **Mutation (Stryker)** | `npm run test:mutation` | Test quality assessment | Configures via `stryker.conf.json` |
| **Stellar Contracts** | `cargo test` | Soroban contracts | `stellar-contracts/**/*.rs` |

---

## apps/api Testing

### Unit Tests

**Purpose**: Test individual functions and business logic in isolation.

**Files**: `src/**/*.test.ts`

**Run locally**:
```bash
cd apps/api
npm run test:unit
npm run test:unit -- --watch  # Watch mode
npm run test:unit -- --coverage  # Coverage report
```

**Example test** (`src/modules/patients/patients.service.test.ts`):
```typescript
import { describe, it, expect } from '@jest/globals';
import { PatientService } from './patients.service';

describe('PatientService', () => {
  it('should validate SSN format', () => {
    const service = new PatientService();
    expect(service.validateSSN('123-45-6789')).toBe(true);
    expect(service.validateSSN('invalid')).toBe(false);
  });
});
```

**Key patterns**:
- Mock external dependencies (database, APIs)
- Test success and failure paths
- Use descriptive test names
- Verify error handling

### Integration Tests

**Purpose**: Test modules working together with a real (or embedded) database.

**Files**: `src/**/*.integration.ts`

**Run locally**:
```bash
cd apps/api
npm run test:integration
npm run test:integration -- --testNamePattern="patients"  # Filter by name
```

**Setup** (in test file):
```typescript
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('PatientController Integration', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express.Application;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    app = await initializeApp();
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  it('should create and retrieve patient', async () => {
    const response = await request(app)
      .post('/api/v1/patients')
      .send({ firstName: 'John', ssn: '123-45-6789' })
      .expect(201);
    
    expect(response.body.data.id).toBeDefined();
  });
});
```

**Key patterns**:
- Use MongoDB in-memory server for isolation
- Test full request/response cycle
- Include database state setup/teardown
- Verify side effects (audit logs, cache invalidation)

### Contract Tests (Pact)

**Purpose**: Verify service boundaries match contracts (e.g., API ↔ Stellar Service).

**Files**: `src/**/*.contract.ts`

**Consumer** (API calls Stellar Service):
```typescript
import { Pact } from '@pact-foundation/pact';

const mockProvider = new Pact({ consumer: 'api', provider: 'stellar-service' });

describe('Stellar Service Contract', () => {
  it('should call /fee-estimate', async () => {
    await mockProvider.addInteraction({
      state: 'network is healthy',
      uponReceiving: 'a request for fee estimates',
      withRequest: {
        method: 'GET',
        path: '/fee-estimate'
      },
      willRespondWith: {
        status: 200,
        body: { baseFee: '100', surgePrice: false }
      }
    });

    const result = await stellarClient.getFeeEstimate();
    expect(result.baseFee).toBe('100');
  });
});
```

**Run tests**:
```bash
cd apps/api
npm run test:contract
```

**Verify pacts published**:
```bash
ls -la pacts/  # Generated .json files
```

### Running All API Tests

```bash
cd apps/api

# Run all tests in sequence
npm run test

# Run with coverage
npm run test:coverage

# View coverage report
open coverage/index.html
```

---

## apps/web Testing

### Unit & Component Tests

**Purpose**: Test React components in isolation.

**Files**: `src/**/*.test.tsx`

**Run locally**:
```bash
cd apps/web
npm run test:unit
npm run test:unit -- --watch
npm run test:unit -- --coverage
```

**Example test** (`src/components/PatientCard.test.tsx`):
```typescript
import { render, screen } from '@testing-library/react';
import { PatientCard } from './PatientCard';

describe('PatientCard', () => {
  it('should display patient name', () => {
    const patient = { id: '1', firstName: 'John', lastName: 'Doe' };
    render(<PatientCard patient={patient} />);
    
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should handle click event', () => {
    const onClick = jest.fn();
    render(<PatientCard patient={patient} onClick={onClick} />);
    
    screen.getByRole('button').click();
    expect(onClick).toHaveBeenCalledWith(patient.id);
  });
});
```

**Key patterns**:
- Use React Testing Library (prefer user interactions over implementation details)
- Mock API calls with `jest.mock()`
- Test accessibility (`getByRole`, `getByLabelText`)
- Verify component behavior, not internals

---

## E2E Tests (Playwright)

**Purpose**: Test complete user workflows against a live application.

**Files**: `e2e/tests/**/*.spec.ts`

**Setup** (local dev environment):
```bash
# Start dev server
npm run dev

# In another terminal, run tests
cd e2e
npm run test:e2e

# Or run specific test file
npx playwright test tests/auth.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug
```

**Example test** (`e2e/tests/patient-workflow.spec.ts`):
```typescript
import { test, expect } from '@playwright/test';

test('patient creation workflow', async ({ page }) => {
  // Navigate to app
  await page.goto('http://localhost:3000');

  // Log in
  await page.fill('input[name="email"]', 'doctor@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button:has-text("Sign In")');

  // Wait for dashboard
  await page.waitForNavigation();
  expect(page.url()).toContain('/dashboard');

  // Create patient
  await page.click('button:has-text("New Patient")');
  await page.fill('input[name="firstName"]', 'John');
  await page.fill('input[name="lastName"]', 'Doe');
  await page.fill('input[name="ssn"]', '123-45-6789');
  await page.click('button:has-text("Save")');

  // Verify success
  await expect(page.locator('text=Patient created')).toBeVisible();
});
```

**Config** (`e2e/playwright.config.ts`):
```typescript
export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

---

## Accessibility Tests

**Purpose**: Verify WCAG 2.1 AA compliance automatically.

**Files**: `e2e/a11y/**/*.spec.ts`  
**Config**: `playwright.a11y.config.ts`

**Run tests**:
```bash
cd e2e
npx playwright test -c playwright.a11y.config.ts

# Or use npm script
npm run test:a11y
```

**Example a11y test**:
```typescript
import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

test('dashboard should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3000/dashboard');
  
  // Inject axe accessibility testing library
  await injectAxe(page);
  
  // Check for a11y issues
  await checkA11y(page);
});
```

**Common issues caught**:
- Missing alt text on images
- Insufficient color contrast
- Form fields without labels
- Missing ARIA attributes
- Keyboard navigation issues

**Fix example**:
```typescript
// ❌ Not accessible
<img src="patient.jpg" />
<input type="text" />

// ✅ Accessible
<img src="patient.jpg" alt="Patient John Doe" />
<label htmlFor="firstName">First Name</label>
<input id="firstName" type="text" />
```

---

## Smart Contract Tests (Stellar/Soroban)

**Location**: `stellar-contracts/contracts/pet-transfer-adoption/src/lib.rs`

**Run tests**:
```bash
cd stellar-contracts
cargo test

# With output
cargo test -- --nocapture

# Specific test
cargo test test_validate_len

# With coverage (requires llvm-tools)
cargo tarpaulin --out Html
```

**Example test** (`lib.rs`):
```rust
#[cfg(test)]
mod test {
  use super::*;

  #[test]
  fn test_validate_len() {
    let env = Env::default();
    let s = String::from_slice(&env, "short");
    validate_len(&env, &s, 256);  // Should pass
  }

  #[test]
  #[should_panic]
  fn test_validate_len_exceeds_max() {
    let env = Env::default();
    let long_string = String::from_slice(&env, &"x".repeat(300));
    validate_len(&env, &long_string, 256);  // Should panic
  }
}
```

---

## Mutation Testing (Stryker)

**Purpose**: Verify test quality by injecting bugs and checking tests catch them.

**Files**: `stryker.conf.json`

**Run**:
```bash
cd apps/api
npm run test:mutation

# View report
open reports/mutation/index.html
```

**Interpret results**:
- **Killed**: Test caught the mutation (good)
- **Survived**: Mutation not caught (test too weak)
- **No coverage**: Mutated line not executed

**Example mutation**:
```typescript
// Original
if (amount > 0) {

// Mutated
if (amount >= 0) {  // Still passes tests?

// You should have a test for this:
expect(() => processPayment(0)).toThrow('Amount must be positive');
```

---

## CI/CD Test Pipeline

**GitHub Actions** (`.github/workflows/test.yml`):
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:latest
      redis:
        image: redis:latest

    steps:
      - uses: actions/checkout@v3
      
      # API tests
      - run: cd apps/api && npm install && npm run test:unit
      - run: cd apps/api && npm run test:integration
      - run: cd apps/api && npm run test:contract
      
      # Web tests
      - run: cd apps/web && npm install && npm run test:unit
      
      # E2E tests
      - run: npm run dev &
      - run: cd e2e && npm run test:e2e
      - run: cd e2e && npm run test:a11y
      
      # Upload coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

---

## Test Coverage Goals

| Type | Goal | Priority |
|------|------|----------|
| Unit | 80%+ | High |
| Integration | 60%+ | High |
| E2E | Critical paths | High |
| Mutation | 75%+ killed | Medium |
| A11y | WCAG AA | Medium |

---

## Debugging Tests

### Debug Jest Tests
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
# Then open chrome://inspect
```

### Debug Playwright Tests
```bash
npx playwright test --debug
# Use inspector panel to step through
```

### Check Audit Logs in Tests
```typescript
// After test action
const logs = await AuditLogModel.find({ resourceId: testPatientId });
expect(logs).toHaveLength(1);
expect(logs[0].action).toBe('PATIENT_VIEW');
```

---

## Resources

- **Testing Library Docs**: https://testing-library.com/
- **Playwright Docs**: https://playwright.dev/
- **Jest Docs**: https://jestjs.io/
- **Axe Accessibility**: https://www.deque.com/axe/
- **Stryker Mutation**: https://stryker-mutator.io/
