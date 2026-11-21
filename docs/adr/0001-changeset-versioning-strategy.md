# ADR 0001: Changeset Versioning Strategy

- **Status:** Accepted
- **Date:** 2024-06-01
- **Deciders:** Platform Engineering, Release Engineering
- **Related:** Issue #1765, `.changeset/config.json`, `.github/workflows/release.yml`, `.github/workflows/changeset-check.yml`, `CHANGELOG.md`, `docs/API_VERSIONING_GUIDE.md`

## Context

The repository uses [Changesets](https://github.com/changesets/changesets) to capture intent-to-release. Contributors add a changeset file to `.changeset/` with every pull request that changes shipped behavior, and `.github/workflows/changeset-check.yml` enforces that a changeset is present.

Historically, nothing consumed those changesets:

- Changeset files accumulated in `.changeset/` and were never versioned or published.
- `.github/workflows/release.yml` existed but produced no tags or GitHub Releases that corresponded to the pending changesets.
- `CHANGELOG.md` was a hand-written API endpoint reference dated `[v1] — 2024-01-01`, not a record of dated releases.

This created two problems:

1. **Contributors** were forced to write changesets that never reached users.
2. **Operators** could not tell what changed between deployments. For HIPAA change management this is a compliance gap: we must be able to produce a dated, auditable record of what shipped.

We need to decide:

- Whether the monorepo's apps and packages share a single version (**fixed**) or version independently (**independent**).
- How the release workflow turns pending changesets into Version Packages PRs, git tags, and GitHub Releases.
- How the root `CHANGELOG.md` relates to per-package changelogs.

## Decision

### 1. Versioning mode: fixed (single version line)

We use **fixed versioning** across the apps and packages in this repository. All released workspaces share one version number and are bumped together.

This is configured in `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["@app/*", "@pkg/*"]],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

The `fixed` groups list every app and package glob so that a single changeset bump moves the whole release train to the same version.

**Rationale:**

- The apps and packages are deployed together as a single product surface. Operators reason about "the release" as one deployable unit, not a matrix of independently versioned artifacts.
- HIPAA change management requires a single, unambiguous "what changed in this deployment" record. Fixed versioning gives one dated release entry per deploy.
- Internal dependency ranges stay simple: a `patch` bump of an internal dependency is always satisfied by the co-released version.
- Independent versioning would multiply the number of tags, releases, and changelog files without a corresponding operational benefit at our current scale.

**Trade-off accepted:** A change to a single package forces a version bump of every workspace. We accept this churn in exchange for a coherent release story. If the repository later grows workspaces with genuinely independent release cadences (for example, a published SDK consumed by external teams), we will revisit this ADR and introduce `linked` groups or split the `fixed` set.

### 2. Release workflow: `changesets/action`

`.github/workflows/release.yml` runs on every push to `main` and uses `changesets/action` to automate the release train:

1. **Version Packages PR.** When `main` contains pending changeset files, the action opens (or updates) a pull request titled **"Version Packages"**. That PR applies `changeset version`, which:
   - Consumes the pending changeset files in `.changeset/`.
   - Bumps the fixed version group.
   - Writes dated entries into the changelogs (see §3).
   - Updates internal dependency ranges.
2. **Publish on merge.** When the Version Packages PR is merged, the action detects that no changesets remain and runs the publish command. Publishing:
   - Creates a git tag for the release (for example `v1.4.0`).
   - Creates a GitHub Release whose body is generated from the changelog entry for that version.
3. **Idempotency.** The action is safe to re-run: if a Version Packages PR is already open it is updated in place rather than duplicated, and if there is nothing to release the workflow exits without side effects.

The workflow requires a token with `contents: write` and `pull-requests: write` permissions so it can push the version branch, open the PR, and create tags and releases.

**Acceptance criteria satisfied:**

- Merging to `main` with pending changesets opens a release PR automatically.
- Merging that PR produces a dated version, a tag, and a GitHub Release.

### 3. Changelogs: root `CHANGELOG.md` vs per-package changelogs

- **Per-package changelogs** (`apps/*/CHANGELOG.md`, `packages/*/CHANGELOG.md`) are the **source of truth** for what changed. They are generated by `changeset version` from the changeset files and contain dated version headings (for example `## 1.4.0` with the release date) plus the categorized entries (`Added`, `Changed`, `Fixed`, `Removed`) contributed by each changeset.
- **Root `CHANGELOG.md`** is a **release-notes index**, not an API reference. It lists dated releases with a short summary and links to the per-package changelogs and the corresponding GitHub Release. It is updated as part of the Version Packages PR so that the root file and the per-package files always agree.
- **API endpoint reference** does **not** live in `CHANGELOG.md`. It has moved to `docs/API_VERSIONING_GUIDE.md` and the OpenAPI specification. `CHANGELOG.md` documents *releases*; the versioning guide and OpenAPI spec document the *API surface and its compatibility policy*.

This separation means:

- Operators reading `CHANGELOG.md` see a chronological, dated record of deployments suitable for change-management evidence.
- API consumers reading `docs/API_VERSIONING_GUIDE.md` see the endpoint list and versioning policy.
- Contributors never hand-edit changelogs; they write changesets, and the tooling produces the dated entries.

## Consequences

### Positive

- Pending changesets are consumed automatically; contributors' changesets reach users.
- Every deploy has a dated, auditable release record, satisfying HIPAA change-management needs.
- Tags and GitHub Releases are consistent with the changesets that produced them.
- `CHANGELOG.md` becomes a meaningful release index instead of a stale API reference.

### Negative / Risks

- Fixed versioning bumps all workspaces on any change, producing version churn.
- The release workflow depends on repository token permissions; misconfiguration blocks releases. This is mitigated by the `changeset-check.yml` gate and by the workflow failing loudly rather than silently skipping.
- Contributors must keep writing changesets; the check workflow enforces this.

### Follow-ups

- Backfill the 12 pre-existing changeset files through the first Version Packages PR so they are versioned and released.
- Add a link from `docs/API_VERSIONING_GUIDE.md` back to this ADR.
- Revisit the fixed-vs-independent decision if independently released workspaces are introduced.

## References

- Changesets documentation: <https://github.com/changesets/changesets>
- `changesets/action`: <https://github.com/changesets/action>
- Issue #1765: Wire Changesets into a release workflow and separate the API changelog from release notes
- `.changeset/config.json`
- `.github/workflows/release.yml`
- `.github/workflows/changeset-check.yml`
- `docs/API_VERSIONING_GUIDE.md`