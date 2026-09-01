# ADR-009: API Deprecation Policies

## Status

Accepted

## Date

2024-04-10

## Context

As the platform evolves, API endpoints and fields will need to be removed or changed in breaking ways. Clinic integrations and the mobile app depend on stable API contracts. Removing endpoints without notice breaks integrations; leaving them indefinitely accumulates technical debt and security surface.

A clear, consistently applied deprecation policy is needed so consumers can plan migrations and the engineering team can confidently remove old code.

## Decision

### Deprecation lifecycle

Every deprecated endpoint follows a mandatory four-phase lifecycle:

```
Deprecated → Sunset period (≥ 90 days) → Removed → Unsupported
```

| Phase | Action | Duration |
|-------|--------|---------|
| **Deprecated** | Endpoint still works; deprecation headers added | — |
| **Sunset period** | Endpoint still works; warnings escalate; migration guide published | ≥ 90 days |
| **Removed** | Endpoint returns 410 Gone with migration instructions | Indefinite |
| **Unsupported** | 410 response removed; route deleted entirely | After 1 full release cycle |

### HTTP deprecation headers

Deprecated endpoints return three response headers:

```
Deprecation: true
Sunset: Sat, 01 Mar 2025 00:00:00 GMT
Link: <https://api.healthwatchers.com/docs/migration/v1-to-v2>; rel="successor-version"
Warning: 299 - "This endpoint is deprecated and will be removed on 2025-03-01. See migration guide."
```

These are set by `v1DeprecationWarning` middleware applied to all `/api/v1` routes.

### Breaking vs non-breaking changes

| Change type | Classification | Policy |
|------------|---------------|--------|
| Remove an endpoint | **Breaking** | Full deprecation lifecycle required |
| Remove a required request field | **Breaking** | Full deprecation lifecycle required |
| Remove a response field | **Breaking** | Full deprecation lifecycle required |
| Change a field type | **Breaking** | Full deprecation lifecycle required |
| Add an optional request field | Non-breaking | No deprecation required |
| Add a response field | Non-breaking | No deprecation required |
| Bug fix with no contract change | Non-breaking | No deprecation required |

### API versioning and deprecation interlock

API v1 (`/api/v1`) is in **deprecated** state. The sunset date is communicated via the `Sunset` header on every v1 response. API v2 (`/api/v2`) is the current supported version.

When a new `/api/v3` is introduced, v2 enters the deprecated phase and the 90-day sunset clock starts.

### Changeset entries

Every deprecation decision must be documented in a `.changeset/*.md` file in the `.changeset/` directory so it appears in the changelog and is communicated to consumers via release notes.

### Field-level deprecation

When removing a JSON response field:

1. Mark the field as deprecated in the OpenAPI spec with `deprecated: true` and an `x-sunset` extension.
2. Continue returning the field for the sunset period.
3. Return `null` for the field after sunset (one release before removal).
4. Remove the field entirely in the following release.

### Internal code deprecation

When deprecating an internal function or module:

1. Add a `@deprecated` JSDoc tag with the replacement.
2. Add a `// See docs/adr/ADR-009-deprecation-policies.md` reference comment.
3. Remove in the next major version or after 60 days, whichever is later.

## Consequences

### Positive

- Consumers get at least 90 days notice before a breaking change affects them.
- `Sunset` and `Link` headers enable tooling (e.g. Postman, client SDKs) to alert developers automatically.
- The changeset requirement ensures deprecations are always communicated in release notes.
- The 410 Gone response (rather than 404) signals intent — the endpoint existed and was intentionally removed.

### Negative / Trade-offs

- 90-day minimum sunset means technical debt accumulates for at least three months after a deprecation decision.
- Maintaining deprecated endpoints alongside current ones doubles the test surface for that period.

### Neutral

- The `v1DeprecationWarning` middleware is a single location; adding the `Sunset` date only requires changing that one middleware.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Immediate removal with a major version bump | Acceptable for open-source libraries; not acceptable for a SaaS API where clinic integrations run on fixed release schedules |
| Indefinite support for all versions | Leads to unbounded technical debt and security surface; explicit sunset dates force action |
| 30-day sunset | Too short for enterprise clinic integrations that require procurement and change-management cycles |

## References

- `apps/api/src/middlewares/api-versioning.middleware.ts` — deprecation headers
- `apps/api/docs/api-versioning-strategy.md` — versioning strategy document
- `.changeset/` — existing deprecation changeset entries
- `docs/adr/ADR-010-api-versioning.md` — API versioning decision
