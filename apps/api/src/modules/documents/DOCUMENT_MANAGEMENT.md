# Document management system (#1247)

Extends the existing upload/version controller. New routes are mounted at
`/api/v1/documents` by `documents-management.controller.ts`.

## What was added

| Concern | Implementation |
|---------|----------------|
| Secure upload | existing multer allow-list + size cap, now also SHA-256 checksum |
| Versioning | existing `DocumentVersion` model, now carries per-version encryption meta |
| **Content search** | Mongo text index on `{ ocrText, fileName, description, tags }` — `GET /documents/search`, access-scoped |
| **Access control** | `accessLevel` (`clinic`/`restricted`/`private`) + `allowedRoles`/`allowedUserIds` + `DocumentAccessGrant` rows. `document-access.service.ts#evaluateAccess` is the single decision point; enforced on every read/write/preview/audit route |
| **Retention policies** | `DocumentRetentionPolicy` (per type, `retentionDays`, action `expire`/`archive`/`purge`, legal hold) |
| **Expiration handling** | `assignRetention` stamps `expiresAt` on upload; `runRetentionSweep` (6h job, also `POST /documents/retention/sweep`) expires → archives → purges bytes after the grace window |
| **Encryption at rest** | `document-encryption.service.ts` — per-file AES-256-GCM data key, wrapped with a master key (`DOCUMENT_ENCRYPTION_KEY`, falls back to `FIELD_ENCRYPTION_KEY`). Local driver serves decrypted via `/_local`; S3 keeps SSE. Feature is inert unless a key is configured |
| **Audit trail** | `DocumentAuditEntry` (append-only) written for upload, version, download, preview, metadata view, grant create/revoke, access-denied, retention transitions, OCR |
| **Preview generation** | `document-preview.service.ts` — `sharp` thumbnail for images; `GET /documents/:id/preview` generates on demand |
| **OCR indexing** | `document-ocr.service.ts` — pluggable `OcrProvider` (`setOcrProvider`); default indexes text/* inline and marks images/PDF `skipped` until an engine is wired. `POST /documents/:id/reindex` |

## New endpoints

```
GET    /documents/search
GET    /documents/:id                     (access-enforced metadata)
PATCH  /documents/:id/metadata
GET    /documents/:id/audit
GET    /documents/:id/preview
POST   /documents/:id/reindex
GET/POST/DELETE /documents/:id/grants[...]
POST   /documents/:id/retention
GET/POST /documents/retention-policies
POST   /documents/retention/sweep
```
