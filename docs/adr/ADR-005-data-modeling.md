# ADR-005: Data Modeling

## Status

Accepted

## Date

2024-03-10

## Context

Health Watchers manages highly structured core data (patient demographics, appointments) alongside semi-structured clinical data (SOAP notes, diagnoses, vitals, lab results, care plans) that varies significantly by clinical speciality. Key requirements:

- Enforce referential integrity at the application layer (MongoDB has no foreign-key constraints)
- Store PHI fields encrypted at rest while keeping non-PHI fields queryable
- Support efficient clinic-scoped queries (the most common access pattern)
- Provide a full audit trail of all changes
- Allow schema evolution without downtime (add fields, change types)

## Decision

### Document model with Mongoose ODM

MongoDB is used with Mongoose schemas for every collection. Mongoose provides:

- Field-level type enforcement and validation before writes
- Middleware hooks (`pre('save')`) for encryption, sanitisation, and audit-log emission
- `select: false` on sensitive fields (password hashes, TOTP secrets, reset tokens) so they are never accidentally returned

### Ownership hierarchy

Every document is anchored to a clinic via a `clinicId` field. The hierarchy is:

```
Clinic → Users, Patients
Patient → Encounters, Appointments, PaymentRecords, LabResults, Immunizations, CarePlans, ConsentForms
Encounter → Prescriptions (embedded), Attachments (embedded)
```

### Embedding vs referencing

| Pattern | Used for | Rationale |
|---------|---------|-----------|
| **Embedded** | Prescriptions in Encounter, VitalSigns in Encounter, allergies in Patient, emergency contacts in Patient | Read together always; bounded in size |
| **Referenced** (ObjectId) | Patient → Clinic, Encounter → Patient, Encounter → Doctor | Independent lifecycle; queried separately |

### PHI field-level encryption

Fields containing Protected Health Information are marked and encrypted with AES-256 before MongoDB storage:

| Collection | Encrypted fields |
|------------|----------------|
| `patients` | `dateOfBirth`, `contactNumber`, `address`, `insurance.policyNumber`, `insurance.groupNumber` |
| All | Any future PHI field must be annotated and added to the encryption middleware |

Non-PHI fields remain in plaintext for efficient indexing.

### Index strategy — ESR rule

All compound indexes follow the **Equality → Sort → Range** ordering:

- Equality fields first (e.g. `clinicId`, `patientId`) — highest selectivity
- Sort fields second (e.g. `createdAt`) — avoids in-memory sort
- Range fields last

Examples from `encounters`:

```
{ clinicId: 1, patientId: 1, createdAt: -1 }   // paginated encounter history
{ clinicId: 1, status: 1, createdAt: -1 }       // status-filtered clinic view
{ clinicId: 1, attendingDoctorId: 1, createdAt: -1 }  // doctor workload
```

### TTL indexes for data retention

| Collection | TTL field | Default retention |
|------------|-----------|------------------|
| `refreshtokens` | `expiresAt` | 7 days |
| `auditlogs` | `createdAt` | 6 years (HIPAA minimum) |
| `clinicalrecords` | `createdAt` | 7 years |

Retention periods are configurable via `AUDIT_LOG_RETENTION_YEARS` and `CLINICAL_RETENTION_YEARS` environment variables.

### Schema migrations

All schema changes are managed with **migrate-mongo**. Migration files live in `apps/api/src/migrations/`. The migration manager is initialised at startup and tracks applied migrations in a `_migrations` collection. Migrations are:

- **Up only** by default; destructive down-migrations require explicit opt-in
- **Idempotent** — safe to re-run
- **Applied before** the application starts accepting traffic

### Soft deletes

Records are never hard-deleted. An `isActive: false` flag marks deactivated patients and users. This preserves referential integrity in audit logs and encounter history.

## Consequences

### Positive

- `clinicId`-first compound indexes ensure clinic-scoped queries are efficient regardless of total collection size.
- TTL indexes automatically enforce HIPAA data retention without a separate cleanup job.
- `select: false` on credential fields makes it impossible to accidentally leak passwords in API responses.
- Embedded sub-documents for vitals and prescriptions reduce join overhead on the most common read path.

### Negative / Trade-offs

- No server-side foreign key enforcement means orphaned documents are possible if the application layer has bugs; compensating integrity checks are needed.
- Field-level encryption means encrypted PHI fields cannot be directly filtered or sorted; search on encrypted fields requires application-level decryption + filter, which is expensive at scale.
- Schema migrations run synchronously at startup; a large migration can delay pod readiness in Kubernetes (mitigated by `startupProbe` timeouts).

### Neutral

- `searchName` (lowercase normalised copy of patient name) is a plaintext denormalised field specifically to enable case-insensitive name search without decrypting the name.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| PostgreSQL with JSONB for semi-structured fields | Possible, but clinical data varies too widely per speciality; MongoDB's native document model is more ergonomic |
| MongoDB Atlas Search for encrypted field search | Would solve the encrypted-field search problem but adds Atlas vendor dependency and cost |
| Application-level referential integrity via transactions | MongoDB multi-document transactions add latency (~3–5 ms overhead); application-layer checks with compensating logic are used instead |

## References

- `apps/api/src/config/sharding-strategy.ts`
- `apps/api/src/config/db.ts` — connection pool and retry logic
- `apps/api/src/config/env.ts` — retention period env vars
- `apps/api/src/migrations/` — migrate-mongo migration files
- `docs/DATABASE_SCHEMA.md` — full collection schemas and index catalogue
