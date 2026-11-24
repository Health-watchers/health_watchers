# Health Watchers API — Documentation Index

Version **1.0.0** · Base URL `/api/v2` (v1 deprecated)

---

## Contents

| Document | Description |
|----------|-------------|
| [openapi.json](./openapi.json) | Full OpenAPI 3.0 specification — import into Swagger UI, Postman, or Insomnia |
| [authentication.md](./authentication.md) | JWT auth, MFA setup, token refresh, logout, roles, account lockout |
| [rate-limiting.md](./rate-limiting.md) | All rate-limit tiers, Redis configuration, response headers, client retry patterns |
| [error-codes.md](./error-codes.md) | Every HTTP status code and machine-readable `code` string with handling examples |
| [webhooks.md](./webhooks.md) | Registering endpoints, payload structure, HMAC-SHA256 signature verification, retry behaviour |
| [sdk.md](./sdk.md) | Reusable TypeScript and Python client classes with pagination, retry, and auto-refresh |
| [integration-examples.md](./integration-examples.md) | End-to-end examples: patient registration, encounter workflow, Stellar payments, bulk export, real-time events |
| [migration-guide.md](./migration-guide.md) | v1 → v2 migration steps, breaking-change policy, database migration commands |
| [api-versioning-strategy.md](./api-versioning-strategy.md) | Version lifecycle, deprecation headers, sunset policy |
| [security-headers.md](./security-headers.md) | Helmet CSP, HSTS, X-Content-Type-Options, body-size limits |
| [middleware-guide.md](./middleware-guide.md) | All Express middleware utilities with code examples |
| [environment-variables.md](./environment-variables.md) | All required and optional environment variables |

---

## Quick Start

### 1. Authenticate

```bash
curl -s -X POST https://api.healthwatchers.io/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"doctor@clinic.example","password":"Secure@123!"}' | jq .data.accessToken
```

### 2. Make a request

```bash
TOKEN="<accessToken from step 1>"

curl -s https://api.healthwatchers.io/api/v2/patients?page=1&limit=20 \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### 3. Refresh before expiry (access tokens live 15 min)

```bash
curl -s -X POST https://api.healthwatchers.io/api/v2/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<your-refresh-token>"}' | jq .data
```

---

## API Route Groups

| Group | Prefix | Key endpoints |
|-------|--------|---------------|
| **Auth** | `/auth` | login, register, refresh, logout, MFA setup/challenge/backup |
| **Users** | `/users` | user profile, password change, preferences |
| **Patients** | `/patients` | CRUD, search, export, medical history, photos, health log |
| **Encounters** | `/encounters` | create, update, sign-off, templates |
| **Appointments** | `/appointments` | schedule, cancel, waitlist |
| **Lab Results** | `/lab-results` | create, update, attach files |
| **Immunizations** | `/patients/:id/immunizations` | record, CVX codes |
| **Care Plans** | `/care-plans` | create, update, goals |
| **Referrals** | `/referrals` | create, complete |
| **Medications** | `/medications` | prescriptions |
| **Consent** | `/patients/:id/consent` | grant, revoke, verify |
| **ICD-10** | `/icd10` | search diagnosis codes |
| **Reports** | `/reports` | generate clinical reports (PDF/CSV) |
| **AI** | `/ai` | risk stratification, encounter summary, CDS alerts |
| **Dashboard** | `/dashboard` | clinic stats, metrics |
| **Portal** | `/portal` | patient-facing portal endpoints |
| **Schedules** | `/schedules` | doctor availability |
| **Payments** | `/payments` | Stellar intents, confirm, balance, fee estimate, path payments |
| **Invoices** | `/invoices` | create, list, mark paid |
| **Subscriptions** | `/subscriptions` | tier management, upgrades |
| **Export** | `/exports` | async bulk export jobs (CSV/PDF/FHIR/HL7) |
| **Clinics** | `/clinics` | create, update, onboarding |
| **API Keys** | `/api-keys` | create, revoke, list |
| **Webhooks** | `/webhooks` | register, list, update, delete, delivery logs |
| **Audit Logs** | `/audit-logs` | HIPAA audit trail query |
| **Documents** | `/documents` | upload, download clinical documents |
| **Notifications** | `/notifications` | in-app notifications |
| **Compliance** | `/compliance` | HIPAA reports, breach incidents |
| **Health** | `/health` | liveness, readiness, startup probes |
| **Metrics** | `/metrics` | Prometheus scrape endpoint |

---

## Authentication Summary

All endpoints require `Authorization: Bearer <accessToken>` unless noted otherwise.

**Public endpoints** (no auth):
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET  /auth/verify-email/:token`
- `POST /auth/refresh`
- `POST /auth/mfa/challenge`
- `POST /auth/mfa/backup`
- `GET  /health/*`
- `POST /webhooks/stellar` *(Stellar service only)*

See [authentication.md](./authentication.md) for the full auth guide.

---

## Rate Limits Summary

| Endpoint group | Limit | Window |
|----------------|-------|--------|
| Auth endpoints | 5 | 15 min / IP |
| Forgot password | 3 | 1 hour / IP |
| General API | 300 | 15 min / IP |
| AI endpoints | 20 | 1 min / clinic |
| Payment endpoints | 20 | 1 min / clinic |
| Patient search | 100 | 1 min / user |
| Bulk export | 5 | 1 hour / user |
| Report generation | 10 | 1 hour / user |

See [rate-limiting.md](./rate-limiting.md) for the full guide.

---

## HIPAA Compliance Notes

- All PHI fields are AES-256 encrypted at rest (`FIELD_ENCRYPTION_KEY`)
- Audit logs are encrypted at rest (`AUDIT_ENCRYPTION_KEY`)
- Backups are encrypted (`BACKUP_ENCRYPTION_KEY`)
- HTTPS enforced via HSTS (`max-age=31536000; includeSubDomains; preload`)
- Access tokens expire in 15 minutes; refresh tokens in 7 days
- All data access is audit-logged (HIPAA § 164.312(b))
- Clinical records retained for 7 years (configurable via `CLINICAL_RETENTION_YEARS`)
- Audit logs retained for 6 years (configurable via `AUDIT_LOG_RETENTION_YEARS`)

---

## Swagger UI

When running locally, the interactive Swagger UI is available at:

```
http://localhost:3001/api-docs
```

Import `openapi.json` directly into [Postman](https://www.postman.com) or [Insomnia](https://insomnia.rest) for a fully-typed request collection.
