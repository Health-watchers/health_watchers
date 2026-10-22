---
title: Documents
description: "Document storage: upload, versioning, download and preview, full-text search and re-indexing, metadata, per-document access grants, retention policies with sweeps, and a per-document audit trail."
---

# Documents

Document storage: upload, versioning, download and preview, full-text search and re-indexing, metadata, per-document access grants, retention policies with sweeps, and a per-document audit trail.

| | |
|---|---|
| **Base path** | `/api/v1/documents` |
| **Source** | [`apps/api/src/modules/documents/documents.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/documents/documents.controller.ts)<br/>[`apps/api/src/modules/documents/documents-management.controller.ts`](https://github.com/Health-watchers/health_watchers/blob/main/apps/api/src/modules/documents/documents-management.controller.ts) |

## Data model

- Document, DocumentVersion, DocumentAccessGrant, DocumentRetentionPolicy, DocumentAudit (`models/`)

## Key endpoints

| Method | Path | Roles |
|--------|------|-------|
| `GET` | `/api/v1/documents` | Authenticated |
| `POST` | `/api/v1/documents/upload` | Authenticated |
| `GET` | `/api/v1/documents/:id/download` | Authenticated |
| `GET` | `/api/v1/documents/:id/versions` | Authenticated |
| `GET` | `/api/v1/documents/_local/:storageKey` | Authenticated |
| `GET` | `/api/v1/documents/search` | Authenticated |
| `GET` | `/api/v1/documents/retention-policies` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/documents/retention-policies` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/documents/retention/sweep` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/documents/:id` | Authenticated |
| `PATCH` | `/api/v1/documents/:id/metadata` | Authenticated |
| `GET` | `/api/v1/documents/:id/audit` | Authenticated |
| `GET` | `/api/v1/documents/:id/grants` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/documents/:id/grants` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `DELETE` | `/api/v1/documents/:id/grants/:grantId` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `POST` | `/api/v1/documents/:id/retention` | `CLINIC_ADMIN`, `SUPER_ADMIN` |
| `GET` | `/api/v1/documents/:id/preview` | Authenticated |
| `POST` | `/api/v1/documents/:id/reindex` | Authenticated |

## Roles

Roles referenced by this module: `CLINIC_ADMIN`, `SUPER_ADMIN`.

- **Authenticated** means any signed-in user. Handlers still scope data to the caller's clinic (and to the caller's own records for `PATIENT` users).
- **Public** means the route has no session guard. It is either intentionally public or authenticated by other means, such as a signature, token, or API key.
