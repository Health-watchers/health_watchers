# Mutation Testing Guide — Issue #1034

Mutation testing measures how well the test suite catches real bugs by injecting small code changes ("mutants") and checking whether tests fail.

## Tool

We use [Stryker Mutator](https://stryker-mutator.io/) with the `@stryker-mutator/jest-runner` adapter.

## Quick Start

```bash
# Run mutation tests (from repo root or apps/api/)
npm run test:mutation --workspace=api

# Analyze results after the run
node apps/api/scripts/analyze-mutation-results.js
```

## Configuration

| File | Purpose |
|------|---------|
| `apps/api/stryker.config.json` | Stryker configuration (mutated modules, thresholds, reporters) |
| `apps/api/jest.mutation.config.cjs` | Jest config scoped to mutation-relevant tests |
| `apps/api/scripts/analyze-mutation-results.js` | Post-run analyzer: surfaces surviving mutants and weak areas |

### Mutated modules

| Module | Why it matters |
|--------|---------------|
| `modules/auth/token.service.ts` | JWT signing / verification — critical security path |
| `modules/auth/jwt-claim-validator.ts` | Claim validation logic |
| `services/token-denylist.service.ts` | Token invalidation after logout |
| `modules/auth/services/backup-code.service.ts` | MFA backup code logic |
| `utils/paginate.ts` | Pagination — off-by-one errors are classic mutation survivors |
| `utils/sanitize.ts` | Input sanitisation |
| `lib/encrypt.ts` | AES-GCM PHI encryption |
| `modules/patients/duplicate-detection.service.ts` | Business-critical deduplication |
| `utils/app-error.ts` | Error classification used across all error handlers |

### Thresholds

| Level | Value | Effect |
|-------|-------|--------|
| `high` | 80 % | Green badge |
| `low` | 60 % | Orange warning |
| `break` | 50 % | CI fails |

## Reports

After a run, reports are written to `apps/api/reports/mutation/`:

| File | Description |
|------|-------------|
| `mutation.html` | Interactive HTML report — open in browser |
| `mutation.json` | Machine-readable JSON — consumed by `analyze-mutation-results.js` |

## Adding a New Module to Mutation Testing

1. Add the path to the `mutate` array in `stryker.config.json`.
2. Add the matching test glob to `testMatch` in `jest.mutation.config.cjs`.
3. Run `npm run test:mutation --workspace=api` to verify the new module is picked up.
4. Run `node apps/api/scripts/analyze-mutation-results.js` to check the score.
5. If surviving mutants are reported, strengthen tests for those specific code paths.

## Interpreting Surviving Mutants

A **surviving mutant** means a change to production code was not caught by any test.

Common patterns and fixes:

| Mutant type | Common cause | Fix |
|------------|-------------|-----|
| `ConditionalExpression` | Missing boundary test (e.g. `>` vs `>=`) | Add edge-case test for the exact boundary value |
| `EqualityOperator` | No test for the failing/passing threshold | Add both sides of the equality |
| `LogicalOperator` | `&&` changed to `\|\|` not detected | Test when only one condition is true |
| `StringLiteral` | Error message not asserted | Assert on `message` in the test |
| `ArithmeticOperator` | Calculation not validated precisely | Add numeric precision assertions |

## CI Integration

Mutation tests run on every PR via `.github/workflows/ci.yml`.  
The `analyze-mutation-results.js` script exits 1 if the score drops below `break` (50 %), causing the pipeline to fail.

## Regression Workflow

If a surviving mutant is found:

1. Identify the location from the HTML report or `analyze-mutation-results.js` output.
2. Write a failing test that exercises the mutated line.
3. Verify the test kills the mutant by re-running `npm run test:mutation --workspace=api`.
4. Commit the new test and confirm CI is green.
