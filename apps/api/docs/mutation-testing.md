# Mutation Testing Guide

Mutation testing measures how well the test suite catches real bugs. Stryker injects small, deliberate code changes ("mutants") and checks whether at least one test fails. A mutant that survives means a change to production code went undetected — a genuine test gap.

---

## Tool stack

| Package | Role |
|---------|------|
| `@stryker-mutator/core` v8.7.1 | Runner orchestrator |
| `@stryker-mutator/jest-runner` v8.7.1 | Jest adapter |
| `@stryker-mutator/typescript-checker` v8.7.1 | Compile-time filter (skips mutants that don't type-check) |

---

## Quick start

```bash
# From repo root
npm run test:mutation --workspace=api

# Analyse results after the run
npm run test:mutation:analyze --workspace=api
```

Both commands run from `apps/api/`. The second reads
`apps/api/reports/mutation/mutation.json` and prints a per-file score table
plus a list of surviving mutants.

---

## Configuration files

| File | Purpose |
|------|---------|
| `apps/api/stryker.config.json` | Main Stryker config — mutated modules, thresholds, reporters |
| `apps/api/jest.mutation.config.cjs` | Jest config scoped to mutation-relevant tests (CJS, no coverage) |
| `apps/api/scripts/analyze-mutation-results.js` | Post-run analyser — per-file breakdown, surviving mutants, exit code |

### stryker.config.json key settings

```jsonc
{
  "coverageAnalysis": "perTest",   // only run tests that cover a mutant
  "ignoreStatic":     true,        // skip mutations in static initialisers
  "concurrency":      2,           // parallel worker count
  "timeoutMS":        60000,       // per-mutant test timeout
  "timeoutFactor":    1.5          // multiplier over baseline test time
}
```

---

## Mutated modules

These are the files Stryker targets, chosen because mutations in them are the
most likely to represent real production bugs that tests should catch.

| Module | Why it's included |
|--------|------------------|
| `modules/auth/token.service.ts` | JWT signing and verification — critical security path |
| `modules/auth/jwt-claim-validator.ts` | Claim field validation; wrong logic lets bad tokens through |
| `modules/auth/services/backup-code.service.ts` | MFA backup code hashing and comparison |
| `services/token-denylist.service.ts` | Token invalidation after logout; survivors mean sessions can't be revoked |
| `modules/patients/duplicate-detection.service.ts` | Business-critical deduplication — off-by-one survivors cause duplicate records |
| `utils/paginate.ts` | Offset/limit arithmetic — classic source of off-by-one survivors |
| `utils/sanitize.ts` | Input sanitisation; survivors mean malicious input can pass through |
| `lib/encrypt.ts` | AES-GCM PHI encryption — any survivor here is a HIPAA risk |
| `utils/app-error.ts` | Error classification used across all error handlers |

---

## Score thresholds

Configured in `stryker.config.json`:

| Level | Value | Effect |
|-------|-------|--------|
| `high` | 80 % | Stryker prints a green badge |
| `low` | 60 % | Stryker prints an orange warning |
| `break` | 50 % | Stryker exits non-zero — **CI pipeline fails** |

The `analyze-mutation-results.js` script applies an independent `--threshold`
flag (default 60, CI passes `--threshold 80`) and exits 1 when the score is
below it. This is how the **>80 % acceptance criterion** is enforced.

---

## Reports

After every run, Stryker writes to `apps/api/reports/mutation/`:

| File | Description |
|------|-------------|
| `mutation.html` | Interactive HTML report — click any mutant to see the diff |
| `mutation.json` | Machine-readable report consumed by `analyze-mutation-results.js` |

Open `mutation.html` in a browser to navigate surviving mutants by file. Each
entry shows the original code, the mutation applied, and which tests ran.

---

## Mutant statuses

| Status | Meaning |
|--------|---------|
| `Killed` | At least one test failed when this mutant was active — good |
| `Survived` | No test detected the change — test gap, needs fixing |
| `NoCoverage` | No test even executes this code — dead code or missing test |
| `Timeout` | Test timed out under the mutant — counted as killed |
| `Ignored` | Excluded via `// Stryker disable` comment |
| `CompileError` | TypeScript checker rejected the mutant — not counted |

---

## Adding a new module

1. Add the source path to the `mutate` array in `stryker.config.json`.
2. Add the matching test glob to `testMatch` in `jest.mutation.config.cjs`.
3. Run the suite locally to confirm the module appears in the report.
4. If surviving mutants appear, add targeted tests before merging (see the
   [Best Practices guide](./mutation-best-practices.md)).

---

## Interpreting surviving mutants

```
• src/utils/paginate.ts:14:18  [ConditionalExpression]
  Replaced (offset + limit) <= total with true
```

This means the condition on line 14 was replaced with `true` and no test
failed. The fix: add a test where `offset + limit > total` and assert the
result is capped correctly.

Common patterns:

| Mutant type | Root cause | Typical fix |
|-------------|-----------|-------------|
| `ConditionalExpression` | Missing boundary test | Add a test for the exact threshold value (both sides) |
| `EqualityOperator` | No test for the failing case | Test `===` vs `!==` explicitly |
| `LogicalOperator` | `&&`/`\|\|` not distinguished | Test where only one operand is true |
| `ArithmeticOperator` | Computed value not asserted | Add a numeric precision assertion |
| `BlockStatement` | Side-effect never verified | Assert observable state change when block executes |
| `BooleanLiteral` | Flag not verified | Flip flag in test and assert different behaviour |
| `UpdateOperator` | Counter not tested at boundaries | Test loop counter at 0, 1, and max |

For a full pattern catalogue see [mutation-best-practices.md](./mutation-best-practices.md).

---

## Regression workflow

When a surviving mutant is found:

1. Open the HTML report and locate the mutant (file, line, diff).
2. Write a test that fails when the mutation is active.
   - Focus the test on the **specific condition**, not just general behaviour.
   - Use `expect(...).toBe(exactValue)` rather than truthiness checks.
3. Re-run `npm run test:mutation --workspace=api` to confirm the mutant is now
   killed.
4. Commit the test. CI will verify the score gate before merge.

---

## CI integration

Mutation tests run on every push/PR that touches a mutated module, via
`.github/workflows/mutation-tests.yml`. The workflow:

1. Runs `stryker run` (full suite).
2. Uploads `mutation.html` and `mutation.json` as artifacts (retained 30 days).
3. Runs `analyze-mutation-results.js --threshold 80` — exits 1 if score < 80 %.
4. Prints a score summary to the job log.

See [mutation-score-tracking.md](./mutation-score-tracking.md) for details on
score history and enforcement, and [mutation-incremental.md](./mutation-incremental.md)
for the incremental (PR-only diff) workflow.
