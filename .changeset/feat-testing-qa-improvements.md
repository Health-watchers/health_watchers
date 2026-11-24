---
'api': minor
'stellar-service': minor
---

# Testing & QA Improvements

Comprehensive testing infrastructure improvements across multiple dimensions:

## Payment Reconciliation Integration Tests

- Added complete test suite for `payment-reconciliation.ts` in stellar-service
- Mock Horizon API client for deterministic testing
- Test coverage for:
  - Successful reconciliation of single and batch payments
  - Payment not found on ledger scenarios
  - Partial failure handling in batches
  - Retry logic and idempotency verification
  - Amount and timestamp tolerance boundaries
  - Reconciliation history and statistics
- 100% test coverage of reconciliation service logic

## Mutation Testing Enhancements

### Auth Module Focus
- Updated Stryker config to target entire auth module (previously only specific files)
- Raised break threshold from 50% to 80% for auth module
- Auth module now requires minimum 80% mutation score to merge

### CI Gates & Automation
- New workflow: `mutation-auth-weekly.yml` runs full auth module scan every Monday
- Automated GitHub issue creation when score drops below 80%
- PR mutation tests now analyze and fail if auth module < 80%
- Added detailed per-file mutation score reporting in CI logs

### Documentation
- Added comprehensive mutation testing section to `TESTING_GUIDE.md`
- Documented how to interpret and fix surviving mutants
- Added common mutant patterns and fix strategies

## Load Testing & Performance

### k6 Baseline Management
- Updated `LOAD_TESTING.md` with detailed baseline update process
- Added patient import load test scenario (`k6/patient-import.js`)
- Documented CI regression alert thresholds (20% over baseline)
- Added process for capturing baselines from staging environment

### Performance CI
- New smoke test runs on every PR (1 minute, 5 req/sec)
- Automatic performance regression detection
- P95 latency alerts when exceeding baseline by 20%
- Performance results posted as PR comments

## SonarCloud Coverage Integration

### Coverage Configuration
- Fixed Jest coverage reporters to output LCOV in all apps
- Added coverage upload steps to `ci.yml` for API and stellar-service
- Updated `sonar-project.properties` with proper exclusions:
  - Test files (`**/*.test.ts`, `**/*.spec.ts`)
  - Mocks (`**/__mocks__/**`)
  - Migrations (`**/migrations/**`)
  - Test setup files
- Set minimum coverage gate at 70% in SonarCloud config
- Added quality gate wait to CI workflow

### Coverage Verification
- CI now verifies LCOV reports exist before upload
- Upload coverage artifacts for debugging
- Proper test file exclusions prevent inflated coverage metrics

## Infrastructure Improvements

- Enhanced `stellar-service/jest.config.ts` with better coverage exclusions
- Coverage reporters now include lcov, json, html for all apps
- Fixed badge URL format in README ready for SonarCloud project key
- All coverage reports properly generated before SonarCloud scan

## Benefits

1. **Payment reconciliation** now has comprehensive test coverage with deterministic mocks
2. **Auth module** has enforced 80% mutation score threshold with weekly monitoring
3. **Performance regressions** caught automatically on every PR
4. **Code coverage** properly tracked in SonarCloud with accurate metrics
5. **Test quality** improved through mutation testing and clear documentation
