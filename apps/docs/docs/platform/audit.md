---
title: Audit Logs
description: "An immutable audit trail of PHI access and mutations, written by `requestAuditMiddleware` and `mutationAuditMiddleware`, with search, summaries, export, and a HIPAA access report."
---

# Audit Logs

An immutable audit trail of PHI access and mutations, written by `requestAuditMiddleware` and `mutationAuditMiddleware`, with search, summaries, export, and a HIPAA access report.

| | |
|---|---|
| **Base path** | `/api/v1/audit-logs, /api/v1/audit` |
| **Source** | [`apps/api/src/modules/audit/audit-logs.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/audit/audit-logs.controller.ts)<br/>[`apps/api/src/modules/audit/audit.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/audit/audit.controller.ts) |

## Data model

- AuditLog (`audit-log.model.ts`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/audit-logs` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/audit` | Authenticated |
| `GET` | `/api/v1/audit/summary` | Authenticated |
| `GET` | `/api/v1/audit/export` | Authenticated |
| `GET` | `/api/v1/audit/hipaa-report` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
