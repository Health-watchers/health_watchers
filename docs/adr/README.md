# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Health Watchers platform.

An ADR documents a significant architectural decision — what was decided, why, what alternatives were considered, and what the consequences are. ADRs are immutable once accepted; superseded decisions get a new ADR that references the old one.

## How to create a new ADR

1. Copy `ADR-000-template.md` to `ADR-NNN-short-title.md` (zero-padded, sequential)
2. Fill in every section
3. Add a row to the index table below
4. Reference the ADR from affected source files: `// See docs/adr/ADR-NNN-short-title.md`
5. Raise a PR — the ADR merges with the code change it documents

## Status legend

| Status | Meaning |
|--------|---------|
| **Proposed** | Under discussion, not yet implemented |
| **Accepted** | Agreed and implemented |
| **Deprecated** | No longer the recommended approach but not yet removed |
| **Superseded** | Replaced by a newer ADR (link provided) |

---

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-000](ADR-000-template.md) | Template | — | — |
| [ADR-001](ADR-001-technology-stack.md) | Core Technology Stack | Accepted | 2024-01-15 |
| [ADR-002](ADR-002-scaling-strategy.md) | Scaling Strategy | Accepted | 2024-02-10 |
| [ADR-003](ADR-003-security-architecture.md) | Security Architecture | Accepted | 2024-02-15 |
| [ADR-004](ADR-004-deployment-strategy.md) | Deployment Strategy | Accepted | 2024-03-01 |
| [ADR-005](ADR-005-data-modeling.md) | Data Modeling | Accepted | 2024-03-10 |
| [ADR-006](ADR-006-caching-strategy.md) | Caching Strategy | Accepted | 2024-03-18 |
| [ADR-007](ADR-007-authentication-approach.md) | Authentication Approach | Accepted | 2024-03-25 |
| [ADR-008](ADR-008-error-handling-design.md) | Error Handling Design | Accepted | 2024-04-01 |
| [ADR-009](ADR-009-deprecation-policies.md) | API Deprecation Policies | Accepted | 2024-04-10 |
| [ADR-010](ADR-010-api-versioning.md) | API Versioning Strategy | Accepted | 2024-04-15 |
| [ADR-011](ADR-011-observability-monitoring.md) | Observability and Monitoring | Accepted | 2024-04-20 |
| [ADR-012](ADR-012-testing-strategy.md) | Testing Strategy | Accepted | 2024-05-01 |
| [ADR-013](ADR-013-i18n-multi-language.md) | Internationalisation (i18n) | Accepted | 2024-05-10 |
| [ADR-014](ADR-014-payment-processing.md) | Payment Processing Architecture | Accepted | 2024-05-15 |
| [ADR-015](ADR-015-hipaa-compliance.md) | HIPAA Compliance Architecture | Accepted | 2024-05-20 |
| [ADR-016](ADR-016-monorepo-structure.md) | Monorepo Structure | Accepted | 2024-06-01 |
| [ADR-017](ADR-017-mfa-enforcement.md) | MFA Enforcement Strategy | Accepted | 2024-06-10 |
| [ADR-018](ADR-018-consent-management.md) | Consent Management and Versioning | Accepted | 2024-06-18 |
| [ADR-019](ADR-019-ai-risk-stratification.md) | AI-Powered Risk Stratification | Accepted | 2024-06-25 |
| [ADR-020](ADR-020-rate-limiting-throttling.md) | Rate Limiting and Throttling | Accepted | 2024-07-01 |

---

## Quick topic index

### Infrastructure & Operations
- [ADR-002](ADR-002-scaling-strategy.md) — Horizontal scaling, MongoDB sharding, Redis, Kubernetes HPA
- [ADR-004](ADR-004-deployment-strategy.md) — Docker, Kubernetes, Helm, blue-green, CI/CD pipeline
- [ADR-016](ADR-016-monorepo-structure.md) — Turborepo, npm workspaces, shared packages

### Security & Compliance
- [ADR-003](ADR-003-security-architecture.md) — Defence-in-depth, Helmet, CSRF, PHI encryption, audit logs
- [ADR-007](ADR-007-authentication-approach.md) — JWT, refresh token rotation, RBAC, denylist
- [ADR-015](ADR-015-hipaa-compliance.md) — HIPAA technical safeguards, retention, breach notification
- [ADR-017](ADR-017-mfa-enforcement.md) — TOTP MFA, grace period enforcement
- [ADR-020](ADR-020-rate-limiting-throttling.md) — Rate limiting tiers, Redis-backed counters

### API Design
- [ADR-009](ADR-009-deprecation-policies.md) — Sunset headers, 90-day lifecycle
- [ADR-010](ADR-010-api-versioning.md) — URL versioning, v1 deprecation, v2 current
- [ADR-008](ADR-008-error-handling-design.md) — Centralised error handler, AppError, structured responses

### Data
- [ADR-005](ADR-005-data-modeling.md) — MongoDB document model, ESR indexes, TTL, migrations
- [ADR-006](ADR-006-caching-strategy.md) — Redis cache, graceful fallback, SCAN invalidation, warm-up

### Features
- [ADR-013](ADR-013-i18n-multi-language.md) — next-intl, 5 locales, CI translation check
- [ADR-014](ADR-014-payment-processing.md) — Stellar blockchain, claimable balances, payment splitting
- [ADR-018](ADR-018-consent-management.md) — Consent versioning, re-consent workflows
- [ADR-019](ADR-019-ai-risk-stratification.md) — CDS rules, Gemini AI, PHI anonymisation

### Quality
- [ADR-001](ADR-001-technology-stack.md) — TypeScript, Express, Next.js, MongoDB, Redis, Stellar
- [ADR-011](ADR-011-observability-monitoring.md) — Pino, OpenTelemetry, Prometheus, Sentry
- [ADR-012](ADR-012-testing-strategy.md) — Jest, Playwright, Pact, Stryker, k6
