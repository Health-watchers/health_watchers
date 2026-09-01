# ADR-016: Monorepo Structure

## Status

Accepted

## Date

2024-06-01

## Context

The platform consists of multiple applications (API, web, mobile, Stellar service, documentation) and shared packages (types, config, anonymization utilities). Managing these as separate repositories would require:

- Coordinating version bumps across repos when shared types change
- Running CI pipelines in separate repos and waiting for publishing to npm
- Duplicating tooling configuration (ESLint, Prettier, TypeScript, Husky)
- Multiple PR reviews for a cross-cutting change

A monorepo approach keeps all code in one place, but requires tooling to avoid rebuilding everything on every change.

## Decision

### Turborepo as the build orchestrator

**Turborepo** is used to manage the monorepo build graph. It provides:

- **Incremental builds**: only rebuilds packages whose inputs have changed (based on file hashing)
- **Remote caching**: build outputs are cached remotely and shared across CI machines (`.turbo` cache directory mounted in CI)
- **Parallel execution**: independent tasks run concurrently across packages
- **Pipeline definition**: `turbo.json` defines task dependencies (`build` depends on `^build` of all dependencies)

### Workspace layout

```
health_watchers/
├── apps/
│   ├── api/            — Express.js backend (port 3001)
│   ├── web/            — Next.js 14 frontend (port 3000)
│   ├── mobile/         — React Native app
│   ├── stellar-service/ — Stellar blockchain payment service (port 3002)
│   └── docs/           — Documentation site
├── packages/
│   ├── config/         — Shared configuration (JWT settings, DB URI)
│   ├── types/          — Shared TypeScript types and ApiErrorCode enums
│   └── anonymize/      — PHI anonymisation utilities
└── ...config files
```

**npm workspaces** manages inter-package dependencies. `@health-watchers/types` is consumed by both `api` and `web`, ensuring the request/response contracts are always in sync.

### Shared packages

| Package | Contents | Consumers |
|---------|---------|----------|
| `@health-watchers/types` | `ApiErrorCode` enum, shared DTO types, Zod schemas | `api`, `web`, `mobile` |
| `@health-watchers/config` | Typed config object (JWT issuer, audience, DB URI) | `api`, `stellar-service` |
| `@health-watchers/anonymize` | AES-256 PHI anonymisation utilities | `api` |

### Tooling shared at root level

All tooling config lives at the repository root and is inherited by all packages:

| Tool | Config file | Purpose |
|------|-------------|---------|
| TypeScript | `tsconfig.base.json` | Base compiler options; packages extend it |
| ESLint | Root `eslint.config.js` | Consistent linting rules |
| Prettier | `.prettierrc` | Code formatting |
| Husky + lint-staged | `.husky/`, `.lintstagedrc.json` | Pre-commit hooks |
| Commitlint | `.commitlintrc.json` | Conventional commit enforcement |
| Changesets | `.changeset/config.json` | Changelog and version management |

### Changesets for versioning

**Changesets** (`@changesets/cli`) is used for changelog generation and version bumping. Every PR that changes user-facing behaviour must include a `.changeset/*.md` file describing the change. This drives the release workflow and ensures every release has accurate changelogs.

## Consequences

### Positive

- A single PR can modify `@health-watchers/types`, `api`, and `web` atomically — no cross-repo coordination needed.
- Turborepo's remote cache means CI does not rebuild packages that have not changed, keeping pipeline times manageable.
- Shared ESLint/Prettier config ensures consistent code style across all apps without per-repo configuration drift.
- Changesets provide a structured changelog that feeds into the release workflow automatically.

### Negative / Trade-offs

- Turborepo adds complexity to the build configuration; engineers need to understand the `turbo.json` task graph to add new tasks correctly.
- A large monorepo can slow down `git status`, `git log`, and IDE indexing for developers on slow machines.
- All packages must use compatible versions of shared dependencies (e.g. TypeScript, React); upgrading one package may require upgrading all.
- A bug in a shared package (e.g. `@health-watchers/types`) can break multiple apps simultaneously.

### Neutral

- `mobile/` is present in the monorepo but has its own build tooling (Metro bundler) that does not participate in the Turborepo pipeline.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Separate repositories per service | Coordination overhead for cross-cutting changes (type changes, security patches) is too high at the current team size |
| Nx instead of Turborepo | Nx is more feature-rich but also more opinionated and complex; Turborepo's simpler mental model was preferred |
| Lerna | Lerna's changelog and versioning has been largely superseded by Changesets; not chosen |
| Publish shared packages to npm | Adds a publish/consume cycle that slows down development; workspace packages avoid this entirely |

## References

- `turbo.json` — Turborepo pipeline configuration
- `package.json` (root) — npm workspace definitions
- `.changeset/config.json` — Changesets configuration
- `.github/workflows/ci.yml` — Turborepo cache mounting in CI
- `.github/workflows/release.yml` — Changesets release workflow
