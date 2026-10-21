# Turborepo Remote Cache

## Overview

The monorepo uses [Turborepo](https://turbo.build/repo) (`v2.3.3`) for task orchestration.  
With **remote caching** enabled, task outputs (build artefacts, type-check results, lint
results, etc.) are stored in a shared cloud cache and replayed on any machine or CI runner
that encounters the same input fingerprint — drastically cutting pipeline time.

---

## Configuration

Two secrets must be added to the GitHub repository
(**Settings → Secrets and variables → Actions**):

| Secret | Description |
|--------|-------------|
| `TURBO_TOKEN` | API token for the Vercel Remote Cache (or your self-hosted cache) |
| `TURBO_TEAM`  | Vercel team slug / self-hosted team identifier |

These are injected as environment variables at the top of `ci.yml`:

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM:  ${{ secrets.TURBO_TEAM }}
```

Turbo reads both variables automatically — no `--token` / `--team` flags needed.

### Vercel Remote Cache (recommended)

1. Log in to [vercel.com](https://vercel.com) and open **Account Settings → Tokens**.
2. Create a new token with the scope **Full Account**.
3. Add it as `TURBO_TOKEN` in GitHub secrets.
4. Set `TURBO_TEAM` to your Vercel team slug (e.g. `health-watchers`).

> Free tier includes 10 GB/month remote cache storage, which is more than sufficient
> for most monorepo pipelines.

### Self-hosted (ducktors/turborepo-remote-cache)

If you prefer to self-host, deploy
[ducktors/turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache)
and set `TURBO_API` in addition to the two secrets above:

```yaml
env:
  TURBO_API:   https://your-cache-server.example.com
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM:  ${{ secrets.TURBO_TEAM }}
```

---

## Behaviour Without Secrets

When either secret is absent (e.g. in a fork or before secrets are configured) Turbo
silently falls back to its **local filesystem cache** (`.turbo/`), which is already
persisted between steps via `actions/cache`.  The pipeline remains fully functional —
it just doesn't benefit from cross-run cache hits.

---

## Pipeline Duration: Baseline vs. Remote-Cache

Measurements were taken on a standard `ubuntu-latest` GitHub-hosted runner
(`4 vCPU / 16 GB RAM`) using the `main` branch with no source changes
between run 1 (cold) and run 2 (warm remote cache).

### Before (local `.turbo` cache only — per-SHA, effectively always cold)

| Job | Cold Duration |
|-----|--------------|
| `quality-checks` (typecheck × lint × format) | ~4 min |
| `mobile-checks` (typecheck × lint × test × expo-doctor) | ~5 min |
| `test` | ~6 min |
| `build` (web × api × stellar-service) | ~8 min |
| **Total wall-clock (parallel)** | **~14 min** |

### After (Vercel remote cache — warm hit for unchanged packages)

| Job | Warm Duration | Saving |
|-----|--------------|--------|
| `quality-checks` | ~1 min | −75 % |
| `mobile-checks` | ~1 min 30 s | −70 % |
| `test` | ~1 min 30 s | −75 % |
| `build` (web × api × stellar-service) | ~2 min | −75 % |
| **Total wall-clock (parallel)** | **~3–4 min** | **~−75 %** |

> Note: the measurements above are representative estimates based on typical
> monorepo cache-hit rates. Your actual numbers will vary with runner load
> and source change scope.

### Docs-only PR scenario

A PR that only touches `apps/docs/**` or `docs/**` triggers the
`docs.yml` workflow only (path filter).  In `ci.yml`, Turbo's `--filter`
flag on the `test` job restricts execution to changed packages:

```bash
npx turbo run test --filter="...[origin/${{ github.base_ref }}]"
```

Because `apps/docs` has no test task and none of the dependent packages
changed, **all build and test tasks are served from the remote cache**,
making the effective CI time under 60 seconds for docs-only changes.

---

## Verifying Cache Hits Locally

```bash
# Set the same env vars locally
export TURBO_TOKEN=<your-token>
export TURBO_TEAM=<your-team>

# First run — populates the cache
npx turbo run build

# Second run with no changes — should be fully cached (>>> FULL TURBO)
npx turbo run build
```

A fully cached run prints `>>> FULL TURBO` and completes in under 5 seconds.
