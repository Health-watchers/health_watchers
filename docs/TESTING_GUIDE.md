# Health Watchers Testing Guide

This document describes the testing patterns and practices used across the Health Watchers platform.

## Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Fixture Factories](#fixture-factories)
- [Database Isolation](#database-isolation)
- [Integration Testing](#integration-testing)
- [Mobile App Testing](#mobile-app-testing)
- [Security Header Testing](#security-header-testing)
- [Best Practices](#best-practices)

## Overview

Health Watchers uses a comprehensive testing strategy covering:

- Unit tests for business logic
- Integration tests for API endpoints
- End-to-end tests for web flows
- Contract tests for API compatibility
- Security tests for HIPAA compliance
- Performance benchmarks

## Test Types

### Unit Tests

Located in `__tests__/unit/` directories within each module. Test individual functions and classes in isolation.

```bash
npm run test --workspace=api
```

### Integration Tests

Located in `src/__tests__/` at the API root. Test full request-response cycles with a real (in-memory) database.

```bash
npm run test:integration --workspace=api
```

### E2E Tests

Located in `apps/web/e2e/`. Test user workflows in a real browser using Playwright.

```bash
npm run test:e2e --workspace=web
```

### Contract Tests

Located in pact directories. Ensure API compatibility between consumer (web) and provider (API).

```bash
npm run test:contract:consumer --workspace=web
npm run test:contract:provider --workspace=api
```

## Running Tests

### API Tests

```bash
# All tests
npm run test --workspace=api

# Watch mode
npm run test:watch --workspace=api

# Coverage report
npm run test:coverage --workspace=api

# Integration tests only
npm run test:integration --workspace=api

# Security tests
npm run test:security --workspace=api

# Performance tests
npm run test:performance --workspace=api
```

### Web Tests

```bash
# Unit tests
npm run test --workspace=web

# E2E tests
npm run test:e2e --workspace=web

# E2E headed mode (see browser)
npm run test:e2e:headed --workspace=web
```

### Mobile Tests

```bash
# Run all mobile tests
npm run test --workspace=mobile

# Watch mode
npm run test:watch --workspace=mobile
```

## Fixture Factories

We use **factory functions** to create test data. This provides:

- Consistent data structure across tests
- Minimal boilerplate
- Easy customization via overrides
- Type safety

### Available Factories

All factories are exported from `apps/api/src/__tests__/factories/index.ts`:

#### Patient Factory

```typescript
import { buildPatient, buildPatientWithPhi, buildHighRiskPatient } from '@api/__tests__/factories';

// Basic patient
const patient = buildPatient();

// Patient with PHI fields populated
const patientWithPhi = buildPatientWithPhi({
  phone: '555-1234',
  email: 'john@example.com'
});

// High-risk patient (for AI/CDS tests)
const highRisk = buildHighRiskPatient({ riskScore: 90 });

// Multiple patients
const patients = buildPatientBatch(10, { clinicId: myClinicId });
```

#### User Factory

```typescript
import { 
  buildUser, 
  buildDoctorUser, 
  buildNurseUser, 
  buildAdminUser,
  buildPatientUser,
  buildMfaUser 
} from '@api/__tests__/factories';

// Basic user (defaults to DOCTOR role)
const user = buildUser();

// Specific roles
const doctor = buildDoctorUser({ clinicId: clinic._id });
const nurse = buildNurseUser();
const admin = buildAdminUser();
const patient = buildPatientUser();

// User with MFA enabled
const mfaUser = buildMfaUser();

// Multiple users
const users = buildUserBatch(5, { clinicId: clinic._id });
```

#### Encounter Factory

```typescript
import {
  buildEncounter,
  buildEncounterWithVitals,
  buildEncounterWithDiagnosis,
  buildClosedEncounter
} from '@api/__tests__/factories';

// Basic encounter
const encounter = buildEncounter({ patientId: patient._id });

// With vitals
const encounterWithVitals = buildEncounterWithVitals();

// With diagnosis and SOAP notes
const diagnosedEncounter = buildEncounterWithDiagnosis();

// Closed encounter
const closed = buildClosedEncounter({ status: 'closed' });

// Multiple encounters
const encounters = buildEncounterBatch(10, { clinicId: clinic._id });
```

#### Payment Factory

```typescript
import {
  buildPayment,
  buildConfirmedPayment,
  buildFailedPayment,
  buildEscrowPayment,
  buildExpiredPayment
} from '@api/__tests__/factories';

// Basic payment
const payment = buildPayment({ amount: '150.00' });

// Confirmed payment with transaction hash
const confirmed = buildConfirmedPayment();

// Failed payment
const failed = buildFailedPayment();

// Escrow payment
const escrow = buildEscrowPayment();

// Expired payment (for job tests)
const expired = buildExpiredPayment();

// Multiple payments
const payments = buildPaymentBatch(20, { clinicId: clinic._id });
```

#### Clinic Factory

```typescript
import { 
  buildClinic, 
  buildClinicWithFullFeatures, 
  buildInactiveClinic 
} from '@api/__tests__/factories';

// Basic clinic
const clinic = buildClinic();

// Enterprise clinic with all features
const enterprise = buildClinicWithFullFeatures();

// Inactive/cancelled clinic
const inactive = buildInactiveClinic();

// Multiple clinics
const clinics = buildClinicBatch(3);
```

### Using Factories in Tests

```typescript
import { PatientModel } from '@api/modules/patients/models/patient.model';
import { buildPatient, buildDoctorUser } from '@api/__tests__/factories';

describe('Patient API', () => {
  it('should create a patient', async () => {
    // Build test data
    const patientData = buildPatient({ firstName: 'Alice' });
    
    // Save to database
    const patient = await PatientModel.create(patientData);
    
    expect(patient.firstName).toBe('Alice');
  });
});
```

## Database Isolation

Integration tests use **per-test database isolation** to prevent flaky tests from shared state.

### Test Database Helpers

Located in `apps/api/src/__tests__/helpers/test-db.ts`:

```typescript
import { setupTestDB, teardownTestDB, clearTestDB } from '@api/__tests__/helpers/test-db';

describe('My Integration Tests', () => {
  // Each test file gets its own MongoDB instance
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  // Clear data between individual tests
  afterEach(async () => {
    await clearTestDB();
  });

  it('test 1', async () => {
    // ... test with isolated database
  });

  it('test 2', async () => {
    // ... clean slate, no data from test 1
  });
});
```

### MongoDB Memory Server

Integration tests use [mongodb-memory-server](https://github.com/nodkz/mongodb-memory-server) which:

- Spins up a real MongoDB instance in memory
- Provides full MongoDB API compatibility
- Automatically cleans up after tests
- No external MongoDB installation required

### Running Integration Tests

Integration tests are configured to run **serially** (`--runInBand`) to ensure complete isolation:

```bash
npm run test:integration --workspace=api
```

This runs all `*.test.ts` files matching the integration pattern with Jest's `--runInBand` flag.

## Integration Testing

### Anatomy of an Integration Test

```typescript
import request from 'supertest';
import { setupTestDB, teardownTestDB, clearTestDB } from '@api/__tests__/helpers/test-db';
import { buildPatient, buildDoctorUser } from '@api/__tests__/factories';
import { signAccessToken } from '@api/modules/auth/token.service';
import app from '@api/app';
import { PatientModel } from '@api/modules/patients/models/patient.model';

describe('POST /api/v1/patients', () => {
  let token: string;
  let clinicId: string;

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup auth
    const user = buildDoctorUser();
    clinicId = user.clinicId.toString();
    token = signAccessToken({
      userId: user._id,
      role: user.role,
      clinicId: clinicId
    });
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  afterEach(async () => {
    await clearTestDB();
  });

  it('creates a patient with 201', async () => {
    const patientData = buildPatient({ clinicId });

    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${token}`)
      .send(patientData);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      firstName: patientData.firstName,
      lastName: patientData.lastName
    });

    // Verify in database
    const patient = await PatientModel.findById(res.body.data._id);
    expect(patient).not.toBeNull();
  });
});
```

## Mobile App Testing

The mobile app (`apps/mobile`) uses Jest with React Native Testing Library.

### Setup

Tests are configured in `apps/mobile/jest.config.js`. The setup includes:

- React Native preset
- Mocked Expo modules
- Testing Library utilities

### Running Mobile Tests

```bash
cd apps/mobile
npm run test

# Watch mode
npm run test:watch
```

### Writing Mobile Tests

#### Service Tests

```typescript
// apps/mobile/services/__tests__/auth.service.test.ts
import { authService } from '../auth.service';

describe('authService', () => {
  it('stores token securely', async () => {
    await authService.login('user@example.com', 'password123');
    const token = await authService.getToken();
    expect(token).toBeTruthy();
  });
});
```

#### Screen Render Tests

```typescript
// apps/mobile/screens/__tests__/DashboardScreen.test.tsx
import { render, screen } from '@testing-library/react-native';
import { DashboardScreen } from '../DashboardScreen';

describe('DashboardScreen', () => {
  it('renders patient name', () => {
    render(<DashboardScreen />);
    expect(screen.getByText(/welcome/i)).toBeTruthy();
  });
});
```

### Mocking Expo Modules

Expo modules are mocked in the Jest setup:

```javascript
// apps/mobile/jest.setup.js
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
}));
```

## Security Header Testing

Security header tests verify HIPAA-compliant headers on all responses.

### Web Security Headers (E2E)

Located in `apps/web/e2e/security-headers.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('web responses include comprehensive security headers', async ({ page }) => {
  const response = await page.goto('/');
  const headers = response!.headers();

  // Content security
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  
  // Clickjacking protection
  expect(headers['x-frame-options']).toBe('DENY');
  
  // HTTPS enforcement
  expect(headers['strict-transport-security']).toContain('max-age');
  
  // MIME type sniffing
  expect(headers['x-content-type-options']).toBe('nosniff');
  
  // Referrer policy
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  
  // Permissions policy
  expect(headers['permissions-policy']).toBeDefined();
});

test('CSP blocks inline scripts in production', async ({ page }) => {
  // Navigate to a page that attempts inline script
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.setContent('<script>alert("XSS")</script>');

  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toContain('Content Security Policy');
});
```

### API Security Headers (Integration)

Located in `apps/api/src/__tests__/security-headers.test.ts`:

```typescript
import request from 'supertest';
import app from '@api/app';

describe('API Security Headers', () => {
  it('includes X-Request-ID on all responses', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('includes security headers on error responses', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('includes CORS headers with restricted origins', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://app.healthwatchers.example.com');
    
    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('blocks CORS from unauthorized origins', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.com');
    
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

## Best Practices

### 1. Use Fixtures Over Manual Setup

❌ **Don't** manually build test data:

```typescript
const patient = {
  systemId: 'PAT-123',
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1990-01-01',
  sex: 'M',
  clinicId: new mongoose.Types.ObjectId(),
  isActive: true,
  // ... many more fields
};
```

✅ **Do** use factories:

```typescript
const patient = buildPatient({ firstName: 'John' });
```

### 2. Isolate Database State

❌ **Don't** share database instances across test files:

```typescript
// Shared MongoDB connection = flaky tests
beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/test');
});
```

✅ **Do** use per-test isolation:

```typescript
beforeAll(async () => {
  await setupTestDB(); // Each test file gets its own DB
});

afterEach(async () => {
  await clearTestDB(); // Clean between tests
});
```

### 3. Test Behavior, Not Implementation

❌ **Don't** test internal implementation details:

```typescript
it('calls the internal helper function', () => {
  const spy = jest.spyOn(service as any, '_internalHelper');
  service.publicMethod();
  expect(spy).toHaveBeenCalled();
});
```

✅ **Do** test the observable behavior:

```typescript
it('returns formatted patient name', () => {
  const result = service.getPatientDisplayName(patient);
  expect(result).toBe('Doe, John');
});
```

### 4. Keep Tests Fast

- Use in-memory databases for integration tests
- Mock external APIs (Stellar, Gemini)
- Run expensive tests (mutation, E2E) in CI only
- Use `test.skip()` or `test.todo()` for WIP tests

## Mutation Testing

Mutation testing measures test suite quality by introducing deliberate bugs ("mutants") and checking if tests catch them. This validates that tests actually detect regressions, not just execute code.

### Running Mutation Tests

```bash
# Full mutation test suite (auth module focus)
npm run test:mutation --workspace=api

# Analyze results
npm run test:mutation:analyze --workspace=api

# With custom threshold
npm run test:mutation:analyze --workspace=api -- --threshold 80
```

### Auth Module Mutation Score Requirements

The auth module is security-critical and must maintain a **minimum 80% mutation score**:

- JWT signing and verification logic
- Password hashing and comparison  
- MFA validation (TOTP, backup codes)
- Token rotation and denylist operations
- Session management

### Current Mutation Score

Run the mutation tests to see current scores per file:

```bash
npm run test:mutation --workspace=api
# Opens HTML report: apps/api/reports/mutation/mutation.html
```

### Interpreting Mutation Results

| Status | Meaning |
|--------|---------|
| **Killed** | Test failed when mutant was active ✅ |
| **Survived** | No test detected the change ❌ — test gap! |
| **NoCoverage** | Code not executed by any test ⚠️ |
| **Timeout** | Test timed out (counted as killed) |

### Fixing Surviving Mutants

1. Open `apps/api/reports/mutation/mutation.html` in browser
2. Find surviving mutants (red indicators with file and line number)
3. Write tests that would fail if that specific mutation existed
4. Re-run mutation tests to verify mutant is now killed

**Example:** If a `ConditionalExpression` mutant survives on `if (count > 0)`:
- Add test case where `count === 0` (boundary)
- Add test case where `count > 0` 
- Assert different behavior in each case
- Ensure the condition is actually necessary

Common mutant types and fixes:

| Mutant Type | Fix Strategy |
|-------------|-------------|
| `ConditionalExpression` | Test both sides of boundary |
| `EqualityOperator` | Test `===` vs `!==` explicitly |
| `LogicalOperator` (`&&`/`\|\|`) | Test where only one operand is true |
| `ArithmeticOperator` | Assert exact computed values |
| `BooleanLiteral` | Flip boolean and assert different behavior |

### CI Enforcement

- **PR checks**: Mutation tests run on auth module changes, must score ≥80%
- **Weekly full run**: Every Monday at 2 AM UTC, full auth module scan
- **Automated alerts**: GitHub issue created if weekly score drops below 80%

For detailed mutation testing workflows and best practices, see:
- `apps/api/docs/mutation-testing.md` — Complete guide
- `apps/api/docs/mutation-best-practices.md` — Pattern catalog
- `apps/api/docs/mutation-score-tracking.md` — Score history

---

## CI Testing

❌ **Don't** use vague names:

```typescript
it('works', () => { ... });
it('test 1', () => { ... });
```

✅ **Do** describe the expected behavior:

```typescript
it('returns 404 when patient ID does not exist', () => { ... });
it('creates encounter with valid CPT codes', () => { ... });
```

### 6. Arrange-Act-Assert Pattern

Structure tests clearly:

```typescript
it('updates patient phone number', async () => {
  // Arrange: setup test data
  const patient = await PatientModel.create(buildPatient());
  
  // Act: perform the action
  const updated = await updatePatient(patient._id, { phone: '555-9999' });
  
  // Assert: verify the outcome
  expect(updated.phone).toBe('555-9999');
});
```

### 7. Test Edge Cases

Don't just test the happy path:

```typescript
describe('createPatient', () => {
  it('creates patient with valid data', () => { ... });
  
  it('rejects patient with missing required fields', () => { ... });
  
  it('rejects patient with future date of birth', () => { ... });
  
  it('rejects patient with invalid sex enum', () => { ... });
  
  it('enforces clinic isolation', () => { ... });
});
```

## CI/CD Integration

Tests run automatically on every push and pull request via GitHub Actions:

- **Unit tests**: Run on every commit
- **Integration tests**: Run on PRs targeting main
- **E2E tests**: Run nightly and on release branches
- **Security tests**: Run on every PR

See `.github/workflows/ci.yml` for details.

## Coverage Requirements

Minimum coverage thresholds:

- **Global**: 80% lines, 80% branches
- **Payments module**: 85% lines, 85% branches
- **Auth module**: 85% lines, 85% branches

Check coverage with:

```bash
npm run test:coverage --workspace=api
```

## Troubleshooting

### Tests Timeout

If tests hang, check for:

- Unclosed database connections
- Dangling timers
- Background jobs not stopped

Use Jest's `--detectOpenHandles` to diagnose:

```bash
npm run test -- --detectOpenHandles --workspace=api
```

### Flaky Tests

If tests pass/fail inconsistently:

1. Check for shared state between tests
2. Ensure `clearTestDB()` runs in `afterEach`
3. Run tests serially with `--runInBand`
4. Check for race conditions with async code

### MongoDB Memory Server Issues

If `mongodb-memory-server` fails to start:

1. Clear the download cache: `rm -rf ~/.cache/mongodb-binaries`
2. Set explicit version in `jest.config.ts`:

```typescript
globalSetup: '<rootDir>/jest.global-setup.ts'
```

## Resources

- [Jest Documentation](https://jestjs.io/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Playwright Documentation](https://playwright.dev/)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [Pact Contract Testing](https://docs.pact.io/)

## Contributing

When adding new test files:

1. Follow the existing patterns in this guide
2. Use fixture factories for test data
3. Ensure integration tests are isolated
4. Document new testing utilities
5. Keep tests maintainable and readable

For questions, see the team's internal testing channel or refer to existing test files as examples.
