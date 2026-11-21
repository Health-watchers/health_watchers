# API Migration Guide

Use additive changes first, deprecate old fields, then remove them after the published support window.

## v2 Coverage Matrix

`/api/v2` currently implements only a subset of the v1 surface. Deprecation headers (`Deprecation`, `Sunset`) are sent **only** on v1 routes that have a working v2 equivalent. Routes without a v2 replacement are not marked deprecated.

| Resource | v1 route | v2 route | v2 status |
| --- | --- | --- | --- |
| Patients | `/api/v1/patients` | `/api/v2/patients` | Implemented |
| Appointments | `/api/v1/appointments` | `/api/v2/appointments` | Implemented |
| Admin (users, roles, settings, etc.) | `/api/v1/admin/*` | `/api/v2/admin/*` | Implemented (admin routers) |
| Auth | `/api/v1/auth` | — | Pending |
| Encounters | `/api/v1/encounters` | — | Pending |
| Prescriptions | `/api/v1/prescriptions` | — | Pending |
| Lab results | `/api/v1/lab-results` | — | Pending |
| Billing / invoices | `/api/v1/billing` | — | Pending |
| Documents | `/api/v1/documents` | — | Pending |
| Reports | `/api/v1/reports` | — | Pending |

> Keep this matrix in sync with `apps/api/src/middlewares/api-versioning.middleware.ts`. The per-route deprecation map there is the source of truth for which v1 routes emit deprecation headers.

## Migration Roadmap

1. **Parity** — Port each remaining resource to `/api/v2` with equivalent behavior and versioned response examples. Update the coverage matrix as each resource lands.
2. **Deprecation** — Once a resource has a v2 equivalent, add it to the per-route deprecation map so its v1 responses carry `Deprecation` and `Sunset` headers. Do not deprecate routes that have no v2 replacement.
3. **Sunset** — Set the `Sunset` date to **at least six months after v2 reaches parity** for that resource, as promised in `CHANGELOG.md`. A Sunset date must never pass without a working v2 replacement.
4. **Removal** — Remove v1 routes only after the published support window has elapsed and release notes have announced the removal.

## Checklist

- Add versioned response examples.
- Document deprecated fields.
- Add compatibility tests.
- Update SDKs and Postman collections.
- Publish release notes before removal.
- Update the v2 coverage matrix when a resource reaches parity.
- Confirm the `Sunset` date is at least six months after v2 parity before deprecating a route.