# Release Notes Template & Process

This document describes how to write release notes, maintain the changelog, and manage versioning for Health Watchers.

---

## Release Notes Template

Copy the block below for each release. Fill in the sections that apply and delete empty ones.

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Breaking Changes

> List every change that requires action from API clients, operators, or other services.

- **AUTH**: `POST /api/v1/auth/login` now returns `accessToken` instead of `token`. Update all API clients.

### New Features

- Added appointment scheduling with conflict detection (#123)
- Stellar path-payment support for multi-asset settlements (#456)

### Improvements

- Reduced patient list load time by 40% with cursor-based pagination (#789)
- Dark mode preference now persists across sessions via `localStorage`

### Bug Fixes

- Fixed race condition in refresh-token rotation that could log users out unexpectedly (#101)
- Corrected ICD-10 search returning duplicate results for short queries (#202)

### Security

- Upgraded `jsonwebtoken` to 9.0.2 (fixes CVE-2022-23529)
- Added `Permissions-Policy` response header to all API responses

### Deprecations

- `GET /api/v1/patients/:id/summary` is deprecated. Use `POST /api/v1/ai/summarize`.
  Sunset: 2027-01-01. See the `Sunset` and `Link` response headers for details.

### Dependency Updates

- Bumped `@playwright/test` 1.43.0 → 1.44.0
- Bumped `next` 14.2.3 → 14.2.35

### Migration Guide

Upgrading from X.Y.(Z-1):

1. Update your API client to read `accessToken` from login responses (was `token`).
2. Run `npm ci` to pick up dependency changes.
3. Add `NEW_REQUIRED_ENV_VAR=<value>` to your `.env`.
```

---

## Release Process

Health Watchers uses [Changesets](https://github.com/changesets/changesets) for automated versioning. Full automation details live in [`docs/RELEASE.md`](./RELEASE.md).

### Step-by-step

1. **Develop** your feature or fix on a branch.
2. **Add a changeset** describing the change and its semver impact:
   ```bash
   npx changeset
   ```
   Select the affected package(s), choose `patch` / `minor` / `major`, and write a one-line summary.
3. **Commit** the generated `.changeset/*.md` file together with your code changes.
4. **Open a pull request**. The `changeset-check` CI job warns if no changeset is present for a user-facing change.
5. **Merge to `main`**. The release pipeline automatically:
   - Bumps package versions based on accumulated changesets.
   - Updates `CHANGELOG.md` with the compiled release notes.
   - Creates a GitHub Release and tags the commit.

### Hotfix releases

For urgent fixes that cannot wait for the next scheduled release:

1. Branch from `main`:
   ```bash
   git checkout -b fix/critical-auth-bypass
   ```
2. Apply the fix and add a `patch` changeset.
3. Open a PR with the `hotfix` label for expedited review.
4. After merge, the pipeline publishes a patch release automatically.

---

## Versioning

Health Watchers follows [Semantic Versioning 2.0.0](https://semver.org/).

| Increment | When to use | Example |
|---|---|---|
| **Major** (X) | Breaking change to a public API contract | `1.0.0 → 2.0.0` |
| **Minor** (Y) | New backward-compatible feature | `1.2.0 → 1.3.0` |
| **Patch** (Z) | Backward-compatible bug fix | `1.2.3 → 1.2.4` |

### API versioning

The REST API uses URL versioning (`/api/v1/`, `/api/v2/`). A new major version is introduced only for breaking changes. Deprecated endpoints carry `Deprecation`, `Sunset`, and `Link` response headers per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) with a minimum **6-month** notice window before removal.

### What counts as a breaking change

- Removing or renaming an endpoint, query parameter, or response field.
- Changing the type or format of an existing response field.
- Requiring a new mandatory request parameter.
- Changing the authentication scheme.
- Raising the minimum supported Node.js version.

---

## Changelog

The project-level `CHANGELOG.md` at the repo root is maintained automatically by the Changesets pipeline. Do **not** edit it by hand.

The API-specific changelog in [`CHANGELOG.md`](../CHANGELOG.md) documents endpoint-level changes by version. Update it when:

- Adding, removing, or modifying an API endpoint.
- Changing response shapes, status codes, or error formats.
- Deprecating an endpoint (include the sunset date and successor URL).
