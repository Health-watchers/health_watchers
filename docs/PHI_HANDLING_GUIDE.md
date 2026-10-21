# PHI Handling Best Practices

Practical rules for handling Protected Health Information (PHI) in this codebase, and where the existing controls live. This complements the threat-model/policy content in [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) — that document covers *why* and the compliance posture; this one covers *how*, day to day, when writing code that touches patient data.

---

## What counts as PHI here

Per `patient.model.ts` (`PHI_FIELDS` / `INSURANCE_PHI_FIELDS`) and the audit/compliance modules, treat the following as PHI:

- Patient identifiers and contact info: `dateOfBirth`, `contactNumber`, `address`
- Insurance details: `insurance.policyNumber`, `insurance.groupNumber`
- Clinical content: SOAP notes, diagnoses, prescriptions, lab results, immunization records, care plans
- Anything in `consentforms`, `medicationhistories`, `labresults`, `documents` (uploaded attachments)

`firstName`/`lastName` and diagnosis codes are PII/PHI too, but are **not** field-level encrypted (see [`SECURITY_POLICY.md#data-encryption`](./SECURITY_POLICY.md#data-encryption) for why — they're used in search/aggregation and would need blind-indexing to encrypt safely). Treat them as sensitive regardless of encryption status.

## Storage

- Fields listed above are encrypted at rest with AES-256-GCM via `apps/api/src/lib/encrypt.ts` (`encrypt()`/`decrypt()`), applied transparently through Mongoose hooks on the model — you should never need to call `encrypt()`/`decrypt()` directly when adding a *new field to an existing PHI-bearing model*.
- **Adding a new PHI field to a model**: add it to that model's `PHI_FIELDS` (or equivalent) list so it's covered by the existing encrypt/decrypt hooks, rather than encrypting it ad hoc at the call site.
- **Adding a new PHI-bearing collection**: follow the same pattern as `patient.model.ts` — encrypt/decrypt via a Mongoose hook, not in controller/service code, so every read/write path benefits automatically.

## Logging

- Never log a full `patient`, `encounter`, or `req.body` object — PHI in those objects will end up in log storage (see [`OBSERVABILITY.md`](./OBSERVABILITY.md#sensitive-data-redaction)).
- Log identifiers, not content: `logger.info({ patientId, encounterId }, 'Encounter closed')`, never the SOAP notes or diagnosis themselves.
- If a new request body field can carry PHI, add its path to `redact.paths` in `apps/api/src/utils/logger.ts` — don't rely on every future log call site remembering not to log it.
- Sentry's `beforeSend` hook (`src/instrument.ts`) strips known PHI keys from error events; if you introduce a new PHI field name, add it there too so stack-trace context/breadcrumbs can't leak it.

## Display and transmission

- Free-text clinical fields (chief complaint, SOAP notes, appointment notes) are HTML-sanitized before saving to prevent stored XSS — reuse the existing sanitization step for any new free-text clinical field rather than trusting client-side escaping alone.
- API responses should return only the fields a given role needs — rely on the existing RBAC/clinic-scoping checks (`clinicId` scoping, role checks) rather than filtering PHI out in the frontend.
- All PHI in transit is covered by TLS; don't introduce a new external call (webhook, third-party API) that sends PHI over plaintext HTTP.

## Audit trail

Every read or mutation of PHI should be traceable. The existing middleware already does this for standard request/response flows:

- `requestAuditMiddleware` (`src/middlewares/request-audit.middleware.ts`) — logs PHI-adjacent reads.
- `mutationAuditMiddleware` (`src/middlewares/mutation-audit.middleware.ts`) — logs create/update/delete operations with a before/after diff.

Both write to the `auditlogs` collection (see [`DATABASE_SCHEMA.md#auditlogs`](./DATABASE_SCHEMA.md#auditlogs)), which carries `userId`, `action`, `resourceType`/`resourceId`, `requestId` (for correlation with logs/traces — see [`OBSERVABILITY.md`](./OBSERVABILITY.md#correlation-ids)), and expires automatically per the configured retention window (TTL index).

If you add a new route or background job that reads or mutates PHI outside the standard Express request/response cycle (a script, a queue consumer, a scheduled job), write an explicit `auditlogs` entry for it — the audit middleware only covers standard HTTP request handling.

## Third-party services and PHI

Before sending any patient data to a third-party API or SDK (analytics, AI/LLM features, error monitoring, email), confirm:

1. A signed BAA is in place with that vendor (see [`BAA_TEMPLATE.md`](./BAA_TEMPLATE.md)), or the data sent is fully de-identified.
2. The integration doesn't log the payload anywhere outside your control (many SDKs log request bodies for debugging by default — check and disable this).
3. If in doubt whether a field is PHI or whether a vendor needs a BAA, ask in the security/compliance channel before shipping — don't guess.

## Quick checklist for a PR that touches patient data

- [ ] New PHI fields added to the model's `PHI_FIELDS` list (encrypted at rest)
- [ ] New free-text fields HTML-sanitized before save
- [ ] No PHI passed to `logger.*` or thrown into an error message that reaches Sentry
- [ ] New sensitive request-body fields added to `redact.paths`
- [ ] Reads/mutations produce an `auditlogs` entry (via existing middleware, or explicitly if outside the request cycle)
- [ ] Any new third-party integration receiving PHI has a BAA or only receives de-identified data
