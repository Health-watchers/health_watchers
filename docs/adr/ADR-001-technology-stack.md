# ADR-001: Core Technology Stack

## Status

Accepted

## Date

2024-01-15

## Context

Health Watchers is a HIPAA-compliant healthcare management platform requiring:

- Strong type safety to minimise runtime errors in clinical workflows
- A mature Node.js ecosystem with a rich set of security-focused libraries
- A flexible document database that models heterogeneous patient records
- A real-time layer for appointment and notification updates
- A blockchain payment rail capable of low-cost cross-border settlement
- A web frontend that supports SSR for SEO and fast first-paint

The team has full-stack TypeScript experience, and the product must support multiple client surfaces (web, mobile, third-party API consumers) from day one.

## Decision

Adopt the following technology stack across all services:

### Runtime & Language

| Layer | Choice | Version |
|-------|--------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20 LTS |
| Package manager | npm workspaces | 10.x |
| Monorepo orchestrator | Turborepo | latest |

### Backend (API Service)

| Concern | Library | Rationale |
|---------|---------|-----------|
| HTTP framework | Express.js | Battle-tested, huge middleware ecosystem, simple mental model |
| Schema validation | Zod | Runtime type-safe parsing; shared with frontend via `@health-watchers/types` |
| ODM | Mongoose | Mature MongoDB ODM with schema enforcement and middleware hooks |
| Real-time | Socket.IO | Bi-directional events over WebSocket with fallback transports |
| Process management | Node.js cluster / Kubernetes | Horizontal scaling without framework lock-in |

### Frontend (Web)

| Concern | Library |
|---------|---------|
| Framework | Next.js 14 (App Router) |
| State / data fetching | React Query (TanStack Query) |
| Styling | Tailwind CSS |
| i18n | next-intl |

### Data

| Store | Technology | Purpose |
|-------|-----------|---------|
| Primary database | MongoDB (Replica Set) | Document model fits heterogeneous clinical records |
| Cache / rate-limit store | Redis (ioredis) | Sub-millisecond reads; shared rate-limit counters across pods |
| Blockchain | Stellar Network (stellar-sdk ^12) | Payment settlement and claimable balances |

### Observability

| Concern | Tool |
|---------|------|
| Structured logging | Pino + pino-http |
| Distributed tracing | OpenTelemetry SDK (OTLP) |
| Error tracking | Sentry ^8 with `@sentry/profiling-node` |
| Metrics | prom-client (Prometheus) |

### Security

| Concern | Library |
|---------|---------|
| HTTP security headers | Helmet.js |
| Input sanitisation | express-mongo-sanitize |
| Authentication tokens | jsonwebtoken (HS256) |
| Password hashing | bcrypt (12 rounds) |
| TOTP MFA | otplib |
| Env validation | Zod (startup-time hard exit on failure) |

## Consequences

### Positive

- Full end-to-end TypeScript eliminates entire classes of integration bugs.
- Shared `@health-watchers/types` package ensures the API contract is always in sync with the web client.
- MongoDB's schema-less storage makes iterating on clinical data models fast.
- Express + Socket.IO on the same HTTP server avoids a second process for real-time.
- Stellar's low transaction fees (~0.00001 XLM) make per-consultation micro-payments viable.

### Negative / Trade-offs

- Express does not enforce structure; discipline is required to keep route handlers thin.
- MongoDB lacks multi-document ACID transactions (available but costly); workflows touching multiple collections require compensating transactions.
- Stellar is less understood by most developers than traditional payment rails (Stripe); onboarding takes longer.
- Turborepo adds build-graph complexity that pays off only once the repo is large enough.

### Neutral

- Node.js single-threaded event loop means CPU-intensive tasks (e.g. AI risk scoring) should be offloaded to worker threads or a separate service.
- ioredis falls back gracefully to the database layer when `REDIS_URL` is absent, enabling local development without Redis.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| NestJS instead of Express | NestJS adds value at scale but its decorator-heavy style is verbose for the current team size; can be adopted later per module |
| PostgreSQL instead of MongoDB | Relational constraints are useful but the flexibility needed for SOAP notes, vitals, and custom clinical fields across specialities made a document model more pragmatic |
| Ethereum / EVM for payments | Gas fees are prohibitively expensive for healthcare micro-payments; Stellar's fee model and built-in claimable balances are a better fit |
| GraphQL instead of REST | REST is simpler to version, audit-log, and rate-limit; GraphQL's overfetching solutions add complexity that is not needed at the current query surface |

## References

- `apps/api/src/app.ts` — middleware stack and service initialisation
- `apps/api/src/config/env.ts` — Zod-validated environment schema
- `apps/api/package.json` — full dependency manifest
- `docs/ARCHITECTURE.md` — system architecture overview
