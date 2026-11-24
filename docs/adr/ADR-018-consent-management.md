# ADR-018: Consent Management and Versioning

## Status

Accepted

## Date

2024-06-18

## Context

HIPAA requires that patients provide written authorisation before their PHI is used or disclosed for purposes not covered by the Privacy Rule's exceptions (e.g. treatment, payment, healthcare operations). Consent must be:

- Captured and stored durably
- Tied to a specific version of the consent form (policy changes require re-consent)
- Auditable — who consented, to what, and when
- Revocable — patients can withdraw consent

Additionally, when clinic privacy policies or consent form text is updated, the platform must track which patients have consented to which version and prompt re-consent for patients on outdated versions.

## Decision

### Consent model

Each patient consent is stored as a `ConsentForm` document linked to the patient record:

```
ConsentForm {
  patientId        — reference to patients
  clinicId         — owning clinic
  consentType      — enum: 'treatment' | 'data_sharing' | 'research' | 'marketing'
  formVersion      — string: semantic version of the consent form text (e.g. "2.1.0")
  consentedAt      — ISO timestamp of consent
  consentedBy      — userId of staff who witnessed/recorded consent (or 'patient' for self-service)
  ipAddress        — client IP at time of consent (for audit)
  withdrawnAt      — set when consent is revoked; null if active
  expiresAt        — optional: consent expiry for time-limited authorisations
}
```

### Consent form versioning

Consent form text is versioned with semantic versioning (`MAJOR.MINOR.PATCH`). The version is stored in a `ConsentFormTemplate` collection:

- **MAJOR bump**: content change that materially alters the scope of consent (e.g. adding a new data-sharing partner) → **re-consent required** for all patients
- **MINOR bump**: clarification or formatting change with no material scope change → no re-consent required
- **PATCH bump**: typo fix → no re-consent required

The current active version for each `consentType` is tracked in the template collection. When a new MAJOR version is published, a background job identifies patients with consent on a prior major version and flags them for re-consent at their next portal visit.

### Re-consent workflow

1. CLINIC_ADMIN publishes a new MAJOR version of a consent form template.
2. Background job marks affected patient consent records as `requiresReConsent: true`.
3. On next patient portal login, the portal checks for `requiresReConsent` flags and presents the updated form.
4. Patient submits consent → new `ConsentForm` document created with the new version; old record retained for audit history.

### Consent withdrawal

Patients can withdraw consent for non-treatment purposes (e.g. research, marketing) via the patient portal. Withdrawal sets `withdrawnAt` on the consent record; it does not delete the record (required for audit trail). The application enforces that withdrawn consent cannot be acted upon.

Treatment consent withdrawal is handled via a clinic-staff workflow, not the patient portal, since it may have clinical implications requiring physician review.

### Audit trail

Every consent creation, update, and withdrawal is captured by `mutationAuditMiddleware` and stored in `auditlogs`. The audit record includes the consent form version and timestamp.

## Consequences

### Positive

- Version tracking ensures patients are always on the latest major consent version; material policy changes trigger re-consent automatically.
- Retaining withdrawn consent records provides a complete audit history for HIPAA compliance.
- Separating consent by `consentType` gives fine-grained control — a patient can consent to treatment but not research.

### Negative / Trade-offs

- Re-consent workflows require patient portal visits; patients who do not log in will not re-consent until prompted by clinic staff.
- Versioning introduces coordination overhead when updating consent form text; a non-breaking typo fix still requires a version bump and template update.

### Neutral

- Consent records are never hard-deleted; the `withdrawnAt` field distinguishes active from revoked consent.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Store consent as a boolean flag on the patient document | Loses version history and makes re-consent tracking impossible |
| Single `consent` collection with no versioning | Cannot detect when a patient's consent is on a superseded policy version |
| Paper consent forms scanned as attachments | Not machine-readable; cannot be queried for automated re-consent workflows |

## References

- `apps/api/src/modules/consent/` — consent module
- `docs/DATABASE_SCHEMA.md` — consent collection schema
- `apps/api/src/middlewares/mutation-audit.middleware.ts`
- `.changeset/feat-consent-management-versioning.md`
- `docs/adr/ADR-015-hipaa-compliance.md`
