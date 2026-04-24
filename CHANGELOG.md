# API Changelog

All notable API changes are documented here. This project follows [Semantic Versioning](https://semver.org/).

## Versioning Policy

- URL versioning: `/api/v1/`, `/api/v2/`, etc.
- Breaking changes require a new major version.
- Deprecated endpoints include `Deprecation: true`, `Sunset: <date>`, and `Link: <successor>` headers per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594).
- All responses include an `API-Version` header.
- Minimum deprecation notice: **6 months** before sunset.

## [v1] — 2024-01-01 (Current)

### Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Register a new user
- `POST /api/v1/auth/login` — Login and receive access + refresh tokens
- `POST /api/v1/auth/refresh` — Refresh access token
- `POST /api/v1/auth/logout` — Invalidate refresh token
- `POST /api/v1/auth/forgot-password` — Request password reset email
- `POST /api/v1/auth/reset-password` — Reset password with token
- `POST /api/v1/auth/change-password` — Change password (authenticated)

### Patients (`/api/v1/patients`)
- `POST /api/v1/patients` — Register a new patient
- `GET /api/v1/patients` — List patients (paginated, filterable)
- `GET /api/v1/patients/:id` — Get patient details
- `PATCH /api/v1/patients/:id` — Update patient demographics
- `DELETE /api/v1/patients/:id` — Soft-delete patient
- `GET /api/v1/patients/:id/encounters` — Patient encounter history
- `GET /api/v1/patients/:id/payments` — Patient payment history
- `GET /api/v1/patients/:id/vitals` — Patient vital sign history
- `GET /api/v1/patients/:id/analytics` — Patient health analytics
- `GET /api/v1/patients/:id/lab-results` — Patient lab result history

### Encounters (`/api/v1/encounters`)
- `POST /api/v1/encounters` — Create encounter
- `GET /api/v1/encounters/:id` — Get encounter
- `PATCH /api/v1/encounters/:id` — Update encounter (DOCTOR/CLINIC_ADMIN)
- `DELETE /api/v1/encounters/:id` — Soft-delete encounter (CLINIC_ADMIN)
- `GET /api/v1/encounters/patient/:patientId` — Encounters by patient

### Lab Results (`/api/v1/lab-results`)
- `POST /api/v1/lab-results` — Order a lab test
- `GET /api/v1/lab-results` — List lab results (filterable)
- `GET /api/v1/lab-results/:id` — Get lab result details
- `PUT /api/v1/lab-results/:id/results` — Enter lab results (DOCTOR/NURSE)

### Payments (`/api/v1/payments`)
- `POST /api/v1/payments/intent` — Create payment intent
- `GET /api/v1/payments` — List payments
- `GET /api/v1/payments/:id` — Get payment details

### AI (`/api/v1/ai`)
- `POST /api/v1/ai/summarize` — Generate clinical summary for an encounter
- `POST /api/v1/ai/health-trends` — Analyze patient vital sign trends
- `POST /api/v1/ai/interpret-labs` — Interpret lab results in plain language

### Clinics (`/api/v1/clinics`)
- `POST /api/v1/clinics` — Create clinic (SUPER_ADMIN)
- `GET /api/v1/clinics` — List clinics
- `GET /api/v1/clinics/:id` — Get clinic details
- `PATCH /api/v1/clinics/:id` — Update clinic (CLINIC_ADMIN)

### Users (`/api/v1/users`)
- `GET /api/v1/users` — List users in clinic
- `GET /api/v1/users/:id` — Get user profile
- `PATCH /api/v1/users/:id` — Update user profile

### Appointments (`/api/v1/appointments`)
- `POST /api/v1/appointments` — Create appointment
- `GET /api/v1/appointments` — List appointments
- `PATCH /api/v1/appointments/:id` — Update appointment
- `DELETE /api/v1/appointments/:id` — Cancel appointment

### Dashboard (`/api/v1/dashboard`)
- `GET /api/v1/dashboard/stats` — Clinic statistics summary

### Audit Logs (`/api/v1/audit-logs`)
- `GET /api/v1/audit-logs` — List audit log entries (CLINIC_ADMIN/SUPER_ADMIN)

### ICD-10 (`/api/v1/icd10`)
- `GET /api/v1/icd10/search` — Search ICD-10 codes

### Settings (`/api/v1/settings`)
- `GET /api/v1/settings` — Get clinic settings
- `PATCH /api/v1/settings` — Update clinic settings

### Version Discovery
- `GET /api/versions` — List all supported API versions and their status

---

## Deprecation Example

When an endpoint is deprecated, the response will include:

```
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: <https://api.healthwatchers.com/api/v2/patients>; rel="successor-version"
API-Version: 1.0
```

Use the `deprecated(sunsetDate, successorUrl)` middleware from `src/middlewares/versioning.middleware.ts` to mark endpoints as deprecated.
