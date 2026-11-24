# ADR-003: Security Architecture

## Status

Accepted

## Date

2024-02-15

## Context

Health Watchers handles Protected Health Information (PHI) and is subject to the HIPAA Security Rule (45 CFR Part 164). The platform must protect PHI in transit and at rest, prevent unauthorised access, detect and respond to breaches, and maintain a tamper-evident audit trail.

Key threat vectors to address:

- Credential theft (brute-force, phishing)
- Token theft / replay attacks
- Injection attacks (NoSQL injection, XSS, CSRF)
- Data leakage via error messages or third-party monitoring tools
- Insider threats (unauthorised PHI access by clinic staff)
- Insecure HTTP headers enabling clickjacking or MIME-type sniffing

## Decision

Security is applied in layers (defence-in-depth):

### Layer 1 — Transport Security

- TLS 1.2+ enforced at the NGINX load-balancer layer; HTTP redirects to HTTPS.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` via Helmet.js.
- `trust proxy 1` configured so `req.ip` reflects the real client IP behind NGINX (required for accurate rate limiting).

### Layer 2 — HTTP Security Headers (Helmet.js)

Configured in `apps/api/src/app.ts`:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

CSP violations are reported to `/api/v1/csp-report` for monitoring.

### Layer 3 — Input Validation and Sanitisation

- All request bodies are validated with **Zod** schemas before reaching business logic; invalid inputs are rejected with 400.
- **express-mongo-sanitize** replaces `$` and `.` in user-supplied data, preventing NoSQL injection (`replaceWith: '_'`).
- Free-text clinical fields (SOAP notes, chief complaint, appointment notes) are **HTML-sanitised** before persistence to prevent stored XSS.
- Request body size is capped at 10 KB (configurable via `MAX_REQUEST_BODY_SIZE`).
- Content-Type validation middleware rejects non-JSON bodies on POST/PUT/PATCH.

### Layer 4 — Authentication and Authorisation

See `ADR-007-authentication-approach.md` for the full JWT strategy.

- Short-lived access tokens (15 min) + long-lived refresh tokens (7 days).
- Token denylist stored in Redis (revoked on logout and password change).
- Role-Based Access Control (RBAC) with 7 roles enforced via `requireRoles()` middleware.
- TOTP MFA mandatory for `DOCTOR` and `NURSE` roles (grace period enforced by background job).

### Layer 5 — CSRF Protection

- CSRF tokens required on all state-mutating requests (POST/PUT/PATCH/DELETE).
- `csrfMiddleware` validates the `X-CSRF-Token` header against a cookie-bound server-side token.
- `SameSite=Strict` cookies prevent cross-site request forgery for cookie-based flows.

### Layer 6 — PHI Encryption at Rest (HIPAA § 164.312(a)(2)(iv))

- PHI fields (`dateOfBirth`, `contactNumber`, `address`, `insurance.*`) encrypted with **AES-256** before MongoDB write.
- Encryption key (`FIELD_ENCRYPTION_KEY`) is a 64-char hex string (32 bytes). Key version tracked in `FIELD_ENCRYPTION_KEY_VERSION`.
- Audit log metadata encrypted with a separate `AUDIT_ENCRYPTION_KEY`.
- Database backups encrypted with `BACKUP_ENCRYPTION_KEY`.
- All three keys are **required in production**; absence causes a hard exit (`process.exit(1)`).

### Layer 7 — Audit Logging (HIPAA § 164.312(b))

- `requestAuditMiddleware` logs every authenticated request (actor, resource, action, timestamp, IP).
- `mutationAuditMiddleware` captures before/after diffs on writes.
- Audit log TTL index automatically expires records after `AUDIT_LOG_RETENTION_YEARS` (default 6 years, HIPAA minimum).
- Audit logs are written to a dedicated `auditlogs` collection, sharded by `clinicId`.

### Layer 8 — PHI Scrubbing in Observability Tooling

- **Pino** logger redacts `authorization`, `cookie`, passwords, tokens, and card numbers via path-based redaction.
- **Sentry** `beforeSend` hook strips PHI fields (`firstName`, `lastName`, `dateOfBirth`, `patientId`, `ssn`, `email`, etc.) before events leave the process.
- OpenTelemetry spans never capture request bodies.

### Layer 9 — Rate Limiting and Account Lockout

- `generalLimiter` (express-rate-limit + Redis store) limits all `/api/*` routes.
- Stricter limiters on `/auth/login`, `/auth/refresh`, and `/auth/mfa-verify`.
- Account lockout triggers after N consecutive failed login/MFA attempts; `lockedUntil` stored in the `users` collection.

### Layer 10 — Secrets Management

- All secrets validated at startup by `apps/api/src/config/env.ts`; missing critical secrets abort process launch.
- Secrets never logged (Pino redaction paths + `REDACTED` censor).
- GitHub Actions secrets used for CI/CD; never hard-coded in source.

## Consequences

### Positive

- Defence-in-depth means no single control failure results in a full compromise.
- Hard-exit on missing HIPAA keys in production prevents accidental plaintext PHI storage.
- PHI scrubbing in Sentry ensures third-party error tracking never receives patient data.
- Comprehensive audit logs satisfy HIPAA § 164.312(b) and support forensic investigation.

### Negative / Trade-offs

- AES-256 field encryption adds ~0.5 ms per encrypted write; acceptable for clinical record throughput.
- Maintaining three separate encryption keys (field, audit, backup) adds key-rotation operational complexity.
- CSRF tokens require frontend cooperation; mobile clients use token-based auth only (no CSRF needed).

### Neutral

- Security header metrics (`security_header_violations_total`) are exposed via Prometheus for alerting.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Database-level encryption (MongoDB Encrypted Storage Engine) | Requires MongoDB Enterprise; field-level encryption provides finer-grained control and is available on all editions |
| AWS KMS for field encryption | Adds latency and external dependency; in-process AES-256 is sufficient and keeps the solution cloud-agnostic |
| OAuth 2.0 / OIDC instead of custom JWT | Valid long-term direction; custom JWT keeps the auth flow within the application boundary for now, simplifying HIPAA compliance scoping |

## References

- `apps/api/src/app.ts` — Helmet, CORS, sanitisation, CSRF middleware stack
- `apps/api/src/config/env.ts` — HIPAA key validation and production hard-exit
- `apps/api/src/instrument.ts` — Sentry PHI scrubbing
- `apps/api/src/utils/logger.ts` — Pino redaction configuration
- `apps/api/src/middlewares/auth.middleware.ts` — JWT + denylist enforcement
- `docs/SECURITY_POLICY.md`
- `apps/api/docs/security-headers.md`
