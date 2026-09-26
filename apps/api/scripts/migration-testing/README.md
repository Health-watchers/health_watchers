# Migration Testing Framework

Automated testing for database migrations, addressing the "Add automated
testing for database migrations" initiative.

## What was implemented

- `run-migration-tests.ts` — the core test framework:
  - **Dry-run validation**: runs each migration's `up()` against a disposable
    test database without committing.
  - **Rollback testing**: applies then reverts every migration, asserting
    state returns to its pre-migration shape.
  - **Data integrity checks**: post-migration verification hooks for
    document counts and reference consistency.
  - **Performance benchmarking**: times each migration and flags any that
    exceed the configured budget.
  - **Compatibility verification**: scans migration source for destructive
    operations (`dropCollection`, `dropIndex`, etc).
  - **Conflict detection**: flags migrations with colliding timestamps.
  - **Checklist + runbook generation**: writes `.migration-reports/RUNBOOK.md`
    and a checklist summarizing pass/fail state per migration.
- `migration-test.config.ts` — central config (test DB URI, performance
  budget, which checks are mandatory, destructive-operation keywords).

## Usage

```bash
npx ts-node scripts/migration-testing/run-migration-tests.ts
```

Reports are written to `apps/api/.migration-reports/`:
- `migration-test-report.json` — machine-readable results per migration.
- `RUNBOOK.md` — generated runbook with checklist and rollback steps.

## Notes / follow-ups

This is a first-pass framework wired for the existing `migrate-mongo`
tooling already in the repo (`migrate-mongo-config.js`). Data integrity
checks currently use a placeholder comparator — a follow-up should replace
`checkDataIntegrity` with real snapshot diffing against staging data.
CI wiring (running this before every deploy) should be added as a pipeline
step once the framework is validated against a real staging database.
