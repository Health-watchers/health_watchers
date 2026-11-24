---
title: Compliance (BAAs & Breaches)
description: "Business Associate Agreement tracking (with signed document storage) and the clinic breach register."
---

# Compliance (BAAs & Breaches)

Business Associate Agreement tracking (with signed document storage) and the clinic breach register.

| | |
|---|---|
| **Base path** | `/api/v1/compliance` |
| **Source** | [`apps/api/src/modules/compliance/compliance.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/compliance/compliance.controller.ts) |

## Data model

- BAA (`baa.model.ts`)
- Breach (`breach.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/compliance/baas` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/compliance/baas` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/compliance/baas/:id/document` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/compliance/baas/:id/document` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/compliance/breaches` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/compliance/breaches` | `CLINIC_ADMIN`, `SUPER_ADMIN` |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.

## Multi-tenant compliance considerations

Clinic data is scoped by `clinicId` at the application layer. Infrastructure-level isolation (Kubernetes `NetworkPolicy` per clinic namespace, per-tier database read/write users) is documented in [`SECURITY.md`](https://github.com/Health-watchers/health_watchers/blob/main/SECURITY.md). The compliance obligations that follow from that model are:

### Tenant data segregation requirements

- Every compliance record (BAA, breach) carries a `clinicId` and is only readable/writable by users whose session resolves to that clinic; `SUPER_ADMIN` access is the sole cross-tenant path and must be logged.
- Shared infrastructure (database cluster, object storage bucket for signed BAA documents) is acceptable only where logical segregation is enforced by scoped database users and per-tenant object key prefixes. Physical isolation is not required, but the segregation control must be testable.
- Signed BAA documents must be stored under a per-clinic prefix and served only through the authenticated document endpoint, never via a public or shared URL.

### Audit obligations per tenant

- Breach register entries, BAA creation, and BAA document upload/download are audit-logged with the acting user, `clinicId`, and timestamp.
- Audit records for one clinic must not be exposed to another clinic's administrators; exports and reports are filtered by `clinicId`.
- Cross-tenant access attempts (including `SUPER_ADMIN` reads) are recorded as security events and retained per the platform retention policy.

### BAA implications for shared infrastructure

- A single platform-level BAA with a hosting/database subprocessor can cover multiple clinics only if each clinic is treated as a separate covered entity data set; the BAA must describe the segregation controls above.
- Clinics on lower tiers sharing database roles must still have per-clinic scoping enforced in queries; tiered database users (read/write) must never grant cross-clinic table access.
- If a clinic requires stricter isolation (dedicated namespace or database), that is a contractual addendum, not a default.

### Evidence from the cross-tenant penetration test

The penetration test scenario "clinic A must not access clinic B's data" produces the following evidence retained for audits:

- Test report showing attempts against the compliance endpoints (`/baas`, `/baas/:id/document`, `/breaches`) with clinic A credentials against clinic B resource IDs, all returning `403`/`404`.
- Confirmation that `NetworkPolicy` denies pod-to-pod traffic between clinic namespaces.
- Confirmation that per-tier database users cannot read or write rows belonging to another clinic.
- Dated sign-off stored alongside the BAA register so the control can be evidenced to auditors.

## Related

- [Breach Incidents](/platform/breach-incidents)
- [Security & HIPAA](/security/hipaa-compliance)
