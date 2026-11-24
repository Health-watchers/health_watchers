---
title: Referrals
description: "Clinic-to-clinic and provider-to-provider referrals with accept/decline, controlled sharing of patient data, outcome tracking, and referral analytics."
---

# Referrals

Clinic-to-clinic and provider-to-provider referrals with accept/decline, controlled sharing of patient data, outcome tracking, and referral analytics.

| | |
|---|---|
| **Base path** | `/api/v1/referrals` |
| **Source** | [`apps/api/src/modules/referrals/referrals.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/referrals/referrals.controller.ts) |

## Data model

- Referral (`referral.model.ts`): `fromClinicId`, `toClinicId`, `referredBy`, `patientId`, `encounterId`, `reason`, `urgency`, status, `acceptedBy`/`acceptedAt`, `declinedReason`, shared data (`demographics`, `encounters`, `labResults`, `prescriptions`), `outcomeNotes`, `outcomeDate`
- `providerType`: `INTERNAL` (default, clinic-to-clinic) or `EXTERNAL` (referral to an external provider). External referrals are tracked via status webhooks instead of in-app accept/decline.
- `externalProvider`: for `EXTERNAL` referrals, the provider details (`name`, `system`, `externalReferralId`, `webhookSecret` reference).
- `statusHistory`: append-only timeline of status transitions (`status`, `source` — `INTERNAL` or `EXTERNAL`, `note`, `changedAt`).

### Referral statuses

`PENDING` → `ACCEPTED` → `SCHEDULED` → `COMPLETED`, plus `DECLINED`, `CANCELLED`, and `EXPIRED`.

### External status transition rules

Status updates received from external providers are validated against the current status before being applied:

| From | Allowed to |
|------|------------|
| `PENDING` | `ACCEPTED`, `DECLINED`, `CANCELLED` |
| `ACCEPTED` | `SCHEDULED`, `CANCELLED` |
| `SCHEDULED` | `COMPLETED`, `CANCELLED` |
| `COMPLETED`, `DECLINED`, `CANCELLED`, `EXPIRED` | _(terminal — no transitions)_ |

Invalid transitions are rejected with `409 Conflict` and are not recorded in `statusHistory`. Every accepted transition appends an entry to `statusHistory` with `source: EXTERNAL`.

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `POST` | `/api/v1/referrals` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/referrals/outgoing` | Authenticated |
| `GET` | `/api/v1/referrals/incoming` | Authenticated |
| `PUT` | `/api/v1/referrals/:id/accept` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `PUT` | `/api/v1/referrals/:id/decline` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/referrals/:id/patient-data` | Authenticated |
| `PATCH` | `/api/v1/referrals/:id/outcome` | `DOCTOR`, `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/referrals/:id/timeline` | Authenticated |
| `POST` | `/api/v1/referrals/webhook/external` | Public (signature-verified) |
| `GET` | `/api/v1/referrals/analytics` | `CLINIC_ADMIN` |

### External provider webhook

`POST /api/v1/referrals/webhook/external` receives status updates from external providers.

- **Authentication:** no session guard. Requests must carry an `X-Referral-Signature` header containing an HMAC-SHA256 signature of the raw request body, computed with the shared secret configured for the provider. Requests with a missing or invalid signature are rejected with `401 Unauthorized`.
- **Body:** `{ externalReferralId, status, note?, occurredAt? }`.
- **Behaviour:** the referral is looked up by `externalReferralId` (scoped to the provider), the transition is validated against the rules above, `statusHistory` is appended, and the referring clinic is notified of the update. Unknown `externalReferralId` returns `404 Not Found`.

### Follow-up notifications

If an `EXTERNAL` referral receives no status update within **30 days** of being sent, an automated follow-up notification is sent to the referring clinic. The check runs on a scheduled job; each referral triggers at most one follow-up per 30-day window.

### Timeline

`GET /api/v1/referrals/:id/timeline` returns the referral's `statusHistory` in chronological order, including the source of each transition, for display in the patient detail page referral timeline. Access is scoped to the referring and receiving clinics.

### Analytics

`GET /api/v1/referrals/analytics` reports, in addition to existing referral metrics:

- **Referral volume by specialty** — count of referrals grouped by specialty.
- **Average time to first appointment** — mean elapsed time between referral creation and the first `SCHEDULED` status (or first appointment), reported in days.

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `DOCTOR`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
