# API Route Structure

All API routers are exported from `src/routes/index.ts` and mounted in `src/app.ts`.

## Version Strategy

| Version | Mount point | Status      | Notes                              |
|---------|-------------|-------------|------------------------------------|
| v1      | `/api/v1`   | Stable      | Deprecation warnings enabled       |
| v2      | `/api/v2`   | Current     | Breaking changes from v1           |

## V1 Route Groups

Routes are organised into domain groups inside `src/routes/v1/index.ts`.

### Auth group `/api/v1`

| Method | Path                          | Description                  |
|--------|-------------------------------|------------------------------|
| *      | `/auth`                       | Login, register, MFA         |
| *      | `/auth/forgot-password`       | Password reset               |
| *      | `/users`                      | User CRUD + management       |

### Clinical group `/api/v1`

| Method | Path                          | Description                  |
|--------|-------------------------------|------------------------------|
| *      | `/patients`                   | Patient records, photos      |
| *      | `/patients/:id/immunizations` | Patient immunization records |
| *      | `/immunizations`              | Conflicts, immunity status, analytics, lots, adverse events, recalls |
| *      | `/encounters`                 | Clinical encounters          |
| *      | `/encounter-templates`        | SOAP note templates          |
| *      | `/appointments`               | Appointment scheduling       |
| *      | `/waitlist`                   | Appointment waitlist         |
| *      | `/lab-results`                | Lab results                  |
| *      | `/icd10`                      | ICD-10 code lookup           |
| *      | `/care-plans`                 | Care plan management         |
| *      | `/referrals`                  | Patient referrals            |
| *      | `/`  (consent)                | Consent (root-mounted)       |
| *      | `/immunizations/cvx`          | CVX vaccine codes            |
| *      | `/reports`                    | Report generation            |
| *      | `/portal`                     | Patient portal               |
| *      | `/schedules`                  | Clinic schedules             |
| *      | `/cds`                        | Clinical decision support    |
| *      | `/pre-auth`                   | Insurance pre-authorisation  |
| *      | `/peer-reviews`               | Peer review workflow         |
| *      | `/ai`                         | AI risk & CDS endpoints      |
| *      | `/dashboard`                  | Dashboard aggregates         |

### Payments group `/api/v1`

| Method | Path              | Description                      |
|--------|-------------------|----------------------------------|
| *      | `/payments`       | Payment intents, confirmation    |
| *      | `/invoices`       | Invoice management               |
| *      | `/subscriptions`  | Subscription billing             |
| *      | `/`  (export)     | Export routes (root-mounted)     |

### Admin group `/api/v1`

| Method | Path                      | Description                    |
|--------|---------------------------|--------------------------------|
| *      | `/clinics`                | Clinic CRUD                    |
| *      | `/settings`               | Clinic settings                |
| *      | `/onboarding`             | Clinic onboarding flow         |
| *      | `/api-keys`               | API key management             |
| *      | `/webhooks`               | Outbound webhook config        |
| *      | `/audit-logs`             | Audit log viewer               |
| *      | `/audit`                  | Audit operations               |
| *      | `/documents`              | Document storage               |
| *      | `/notifications`          | In-app notifications           |
| *      | `/compliance`             | HIPAA compliance tools         |
| *      | `/admin/breach-incidents` | Breach incident management     |

### Infrastructure group `/api/v1`

| Method | Path                              | Description                       |
|--------|-----------------------------------|-----------------------------------|
| POST   | `/cdn/cache-invalidation`         | Invalidate CDN paths              |
| POST   | `/cdn/cache-invalidation/bulk`    | Bulk CDN cache invalidation       |
| GET    | `/cdn/cache-status/:path`         | Check cache status for a path     |
| GET    | `/cdn/metrics`                    | CDN performance metrics           |
| GET    | `/replication/status`             | MongoDB replica set health        |
| GET    | `/replication/lag`                | Replication lag metrics           |
| GET    | `/replication/consistency`        | Consistency metrics               |
| POST   | `/replication/test-failover`      | Test failover procedure           |
| GET    | `/replication/read-preferences`   | Available read preference configs |
| GET    | `/replication/metrics`            | Aggregated replication metrics    |

### System group `/api/v1`

| Method | Path       | Description                    |
|--------|------------|--------------------------------|
| *      | `/health`  | Comprehensive health checks    |
| *      | `/csp-report` | Browser CSP violation reports |

### Public (root-level, no version prefix)

| Mount point     | Description                               |
|-----------------|-------------------------------------------|
| `/.well-known`  | Stellar federation well-known endpoint    |
| `/federation`   | Stellar federation lookup                 |
| `/health/live`  | Kubernetes liveness probe                 |
| `/health/ready` | Kubernetes readiness probe                |
| `/metrics`      | Prometheus metrics scrape endpoint        |

## V2 Route Groups

V2 introduces breaking response shape changes and additional real-time events.

### Appointments `/api/v2`

| Method | Path                       | V2 change vs V1                             |
|--------|----------------------------|---------------------------------------------|
| GET    | `/appointments`            | Adds `meta.totalByStatus`, `version` field  |
| PUT    | `/appointments/:id`        | Emits real-time Socket.IO events on change  |
| DELETE | `/appointments/:id`        | Emits cancellation events to both parties   |
| POST   | `/appointments/:id/check-in` | New endpoint — patient check-in flow      |

## Adding a New Route Group

1. Create `src/routes/<group>/index.ts` with a named `Router` export.
2. Re-export it from `src/routes/index.ts`.
3. Mount it in `src/routes/v1/index.ts` (or v2) under the appropriate group comment block.
4. Update this document.
