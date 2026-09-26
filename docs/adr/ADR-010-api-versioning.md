# ADR-010: API Versioning Strategy

## Status

Accepted

## Date

2024-04-15

## Context

The API serves:

- The web application (updated in lockstep with the API)
- A React Native mobile app (released on app store cycles; cannot be force-updated)
- Third-party clinic integrations (running on whatever version was available at integration time)

Breaking changes must not disrupt these consumers. A versioning strategy is needed that:

- Makes the current API version discoverable
- Allows old versions to be maintained temporarily
- Signals deprecations clearly to consumers
- Is simple to implement and reason about

## Decision

### URL-based versioning

API versions are embedded in the URL path:

```
/api/v1/...   — deprecated, maintained for backwards compatibility
/api/v2/...   — current stable version
```

Version segments are integers, not semver. Minor and patch changes within a version are non-breaking by definition (see ADR-009).

URL-based versioning is chosen over header-based versioning because it:

- Is visible in logs, browser history, and monitoring tools without needing to inspect headers
- Is easy to test in a browser or with curl
- Works with all HTTP caching proxies without `Vary: Accept-Version` complications

### Accept-Version header negotiation (opt-in)

The `acceptVersionMiddleware` also supports `Accept-Version: 2` request headers as an alternative to URL versioning, for clients that prefer content negotiation. The URL version takes precedence if both are provided.

### Version discovery endpoint

```
GET /api/versions
→ { versions: ['1.0', '2.0'], current: '2.0', deprecated: ['1.0'] }
```

Clients can poll this endpoint to detect when their version enters deprecation.

### API version response header

Every response from a versioned route includes:

```
API-Version: 2.0
```

This allows clients to confirm which version served the response, even when routing through a proxy.

### V1 deprecation signalling

All `/api/v1` responses pass through `v1DeprecationWarning` middleware that adds:

```
Deprecation: true
Sunset: <configured sunset date>
Link: <migration-guide-url>; rel="successor-version"
Warning: 299 - "API v1 is deprecated..."
```

### V2 — current stable

`/api/v2` is the current version. It adds:

- Real-time Socket.IO event subscriptions for appointments and notifications
- Structured pagination with `{ data, meta: { page, limit, total } }`
- Additional filter parameters on list endpoints
- AI risk stratification endpoints

### Breaking change policy

A new URL version (`/api/v3`) is only created when a breaking change is required. Additive changes (new optional fields, new endpoints) are made within the current version.

### Route implementation

Each version has its own router file (`routes/v1.ts`, `routes/v2.ts`) that mounts module routers. Shared business logic lives in service classes, not in route handlers, so v1 and v2 routes can call the same service methods with different request/response shapes.

## Consequences

### Positive

- URL versioning is immediately understandable to any HTTP client.
- Separate router files make it easy to diff what changed between versions.
- The version discovery endpoint enables proactive consumer tooling.
- Middleware stacks (rate limiting, CSRF, trace ID) are applied consistently per version.

### Negative / Trade-offs

- Maintaining two router files (`v1`, `v2`) for the deprecation period duplicates some route registration.
- Breaking changes require a new URL version, which increases the number of active URL prefixes temporarily.
- Consumers that hard-code `/api/v1` will need to update their code; `Sunset` headers help, but do not force action.

### Neutral

- `traceIdHeader` and `rateLimitMonitor` middleware are applied identically to v1 and v2, so observability and rate-limiting behaviour is consistent across versions.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Header-based versioning (`Accept-Version: 2`) | Invisible in URLs; complicates caching; harder to test manually |
| Semver versioning in URL (`/api/v2.1.0/`) | Too granular; minor/patch changes are non-breaking by policy |
| Query parameter versioning (`?version=2`) | Poor HTTP cache key design; breaks proxy caching |
| GraphQL (single versioned schema) | Schema stitching and field deprecation in GraphQL achieves similar goals but adds query language complexity not needed for this use case |

## References

- `apps/api/src/middlewares/api-versioning.middleware.ts`
- `apps/api/src/routes/v1.ts`
- `apps/api/src/routes/v2.ts`
- `apps/api/src/app.ts` — version route mounting
- `apps/api/docs/api-versioning-strategy.md`
- `docs/adr/ADR-009-deprecation-policies.md`
