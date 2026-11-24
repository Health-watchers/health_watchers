# Incremental Mutation Testing

Full mutation runs across all mutated modules can take several minutes. Incremental mode makes PR feedback fast by re-running only the mutants affected by the diff since the last known-good run.

---

## How incremental mode works

Stryker stores a snapshot of every mutant's last known result in a local state file (`reports/mutation/stryker-incremental.json`). On subsequent runs with `--incremental`, it:

1. Computes a diff between the current source files and the source hashes stored in the state file.
2. Skips any mutant whose source line has not changed and whose last recorded result was `Killed` or `Timeout`.
3. Re-runs only mutants on changed lines, plus all mutants in any file whose tests have changed.

This means a PR that touches two files out of ten will only mutate those two files. A full run is still needed when the baseline is stale — typically on merges to `main`.

---

## State file

```
apps/api/reports/mutation/stryker-incremental.json
```

- **Do not commit this file.** It contains absolute paths and machine-specific hashes. Add it to `.gitignore` if it is not already excluded (the `reports/` directory should be ignored).
- **Cache it in CI** between runs on the same branch (see the CI section below).
- **Delete it** to force a full re-run locally.

---

## Running incrementally — local

```bash
# First run: builds the state file (same as a full run)
npm run test:mutation --workspace=api

# Subsequent runs on the same branch: only re-mutates changed files
npm run test:mutation:incremental --workspace=api
```

The `test:mutation:incremental` script needs to be added to `apps/api/package.json`:

```json
"test:mutation:incremental": "stryker run --incremental"
```

On the first incremental run there is no state file, so Stryker falls back to a full run automatically.

---

## Running incrementally — CI (pull requests)

The key is caching the incremental state file between workflow runs on the same branch. Without caching, every PR run starts fresh and incremental mode provides no benefit.

Add the following to `.github/workflows/mutation-tests.yml`:

```yaml
# ── Restore incremental state from cache ─────────────────────────────────────
- name: Restore incremental mutation cache
  if: github.event_name == 'pull_request'
  uses: actions/cache@v4
  with:
    path: apps/api/reports/mutation/stryker-incremental.json
    # Cache key includes the base branch + a hash of all source files.
    # When source changes, a partial restore from restore-keys is used.
    key: stryker-incremental-${{ github.base_ref }}-${{ hashFiles('apps/api/src/**/*.ts') }}
    restore-keys: |
      stryker-incremental-${{ github.base_ref }}-

# ── Run mutation tests ────────────────────────────────────────────────────────
- name: Run mutation tests (incremental on PRs, full on push)
  run: |
    if [ "${{ github.event_name }}" = "pull_request" ]; then
      npm run test:mutation:incremental --workspace=api
    else
      npm run test:mutation --workspace=api
    fi
  env:
    JWT_ACCESS_TOKEN_SECRET: test-access-secret-32-chars-long!!
    JWT_REFRESH_TOKEN_SECRET: test-refresh-secret-32-chars-long!
    NODE_ENV: test
    API_PORT: 3001

# ── Save updated incremental state ───────────────────────────────────────────
- name: Save incremental mutation cache
  if: github.event_name == 'pull_request' && always()
  uses: actions/cache/save@v4
  with:
    path: apps/api/reports/mutation/stryker-incremental.json
    key: stryker-incremental-${{ github.base_ref }}-${{ hashFiles('apps/api/src/**/*.ts') }}
```

### Why full runs on push to main/develop?

Incremental mode can miss mutants if the state file is based on a partial or stale run. Merging to `main` triggers a full run that rebuilds a clean, authoritative baseline. This ensures the score reported on `main` is always complete.

---

## Cache key strategy

| Scenario | What happens |
|----------|-------------|
| Same branch, same source files | Exact cache hit — full incremental benefit |
| Same branch, source changed | Partial restore from `restore-keys` prefix — Stryker re-runs only changed mutants |
| New branch (no matching base) | No cache hit — falls back to full run, state file written for next run |
| Merge to main | Full run forced; cache not used or saved on push events |

---

## What gets re-run

Stryker re-mutates a file when any of the following change:

| Change type | Re-run scope |
|------------|-------------|
| Source file modified | All mutants in that file |
| Test file modified | All mutants covered by that test file |
| New test file added | All mutants it covers |
| `stryker.config.json` changed | Full re-run (Stryker detects config hash change) |
| `jest.mutation.config.cjs` changed | Full re-run |

---

## Verifying incremental behaviour

After a run with `--incremental`, the Stryker output includes a summary line like:

```
Using incremental run result for 42/60 mutants.
Running 18 mutants.
```

If all 60 mutants are re-run, either:
- No state file was found (first run).
- The state file was stale or from a different config hash.
- `stryker.config.json` or `jest.mutation.config.cjs` changed.

---

## Forcing a full re-run locally

```bash
# Delete the state file — next run is always full
rm apps/api/reports/mutation/stryker-incremental.json
npm run test:mutation --workspace=api
```

Do this before raising a PR if you want to ensure a clean baseline score rather than relying on cached incremental state.

---

## Limitations

- **Score accuracy**: incremental scores reflect only the mutants that were re-run. The score shown after an incremental run is computed over all mutants (using cached results for unchanged ones), so it remains comparable to a full run score — but it is only as accurate as the cached baseline.
- **Cache invalidation**: if the baseline was from a partial run or a run with a different threshold, the cached results may not reflect the full picture. When in doubt, force a full run.
- **Stryker version changes**: upgrading `@stryker-mutator/core` should be followed by deleting the state file and running a fresh full baseline.
- **Renamed files**: Stryker does not detect renames. If a file is renamed, its mutants appear new (full re-run for that file) and the old file's cached results are orphaned. The orphaned entries are harmless but add noise to the state file.

---

## .gitignore entries to verify

Ensure these patterns are present in `apps/api/.gitignore` or the root `.gitignore`:

```gitignore
# Mutation testing
apps/api/reports/
apps/api/stryker-incremental.json
```

The `reports/` directory contains generated HTML, JSON, and the incremental state file. None of these should be committed.

---

## Summary

| Mode | When to use | Command |
|------|------------|---------|
| Full run | Push to `main`/`develop`, setting a clean baseline, first run on a new branch | `npm run test:mutation --workspace=api` |
| Incremental | PR development loop, fast feedback on changed files | `npm run test:mutation:incremental --workspace=api` |
| Analyze | After any run, to see surviving mutants and enforce the 80 % gate | `npm run test:mutation:analyze --workspace=api` |
