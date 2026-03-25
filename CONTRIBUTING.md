# Contributing to Health Watchers

Thanks for taking the time to contribute. Please read this guide before opening a PR.

## Branching Strategy

- `main` — production-ready code. Direct pushes are not allowed.
- `feat/<name>` — new features.
- `fix/<name>` — bug fixes.
- `chore/<name>` — maintenance, dependency updates, config changes.

Branch off `main`, keep branches short-lived, and open a PR when ready for review.

## Pull Requests

- PRs can target any branch; CI runs automatically on every PR regardless of target.
- Every PR requires at least **1 approving review** before merge.
- All CI checks must pass before a PR can be merged (see [CI Checks](#ci-checks) below).
- Keep commits atomic and write meaningful commit messages (imperative mood: "Add X", "Fix Y").

## CI Checks

The CI pipeline (`.github/workflows/ci.yml`) runs two jobs on every PR:

### `build` job
| Step | Command | Failure means |
|------|---------|---------------|
| Install | `npm install` | Dependency resolution broken |
| Build | `npm run build` | TypeScript compile error |
| Lint | `npm run lint` | ESLint violations |
| Test | `npm run test` | A unit/integration test failed |

A failing test **blocks the PR from being merged**. Fix the test or the code — do not skip or comment out tests to get CI green.

### `security` job
| Step | Command | Failure means |
|------|---------|---------------|
| Audit | `npm audit --audit-level=high` | A high or critical severity vulnerability exists in the dependency tree |

If the audit fails, either:
1. Upgrade the affected package to a patched version, or
2. Open a separate issue documenting the risk and a mitigation plan before merging.

## Branch Protection Rules (GitHub Settings)

Configure the following on the `main` branch under **Settings → Branches → Branch protection rules**:

- [x] **Require a pull request before merging**
  - Require at least 1 approval
  - Dismiss stale pull request approvals when new commits are pushed
- [x] **Require status checks to pass before merging**
  - Required checks: `Build, Lint & Test`, `Security Audit`
  - Require branches to be up to date before merging
- [x] **Require conversation resolution before merging**
- [x] **Do not allow bypassing the above settings** (applies to admins too)

## Local Development

```bash
# Install all workspace dependencies
npm install

# Run all services in dev mode
npm run dev

# Run tests across all workspaces
npm run test

# Lint all workspaces
npm run lint
```

## Adding Tests

Tests live alongside the module they cover. For example:

```
apps/api/src/modules/auth/
  auth.controller.ts
  auth.controller.test.ts   ← unit test lives here
```

Each workspace's `package.json` must have a `test` script. If a workspace has no tests yet, add a placeholder so the Turbo pipeline doesn't fail:

```json
"scripts": {
  "test": "echo \"No tests yet\" && exit 0"
}
```

Once you add real tests, replace the placeholder with your test runner command (e.g., `jest --runInBand`).

## Code Style

- TypeScript strict mode is enabled — no `any` unless absolutely necessary.
- ESLint rules are enforced in CI; run `npm run lint` locally before pushing.
- Shared types go in `packages/types`, shared config in `packages/config`.
