---
"api": minor
---

feat: add consent form versioning with re-consent flow (HIPAA compliance)

- Add ConsentFormModel with version, content, effectiveDate, and clinicId fields
- Add formVersion ObjectId ref to ConsentModel linking each consent to its form version
- POST /consent/forms — publish new form version and notify existing patients by email
- GET /consent/current-version?type= — return latest active consent form for the clinic
- POST /consent/re-consent — patient accepts a new version with full audit trail
- Add CONSENT_VERSION_ACCEPTED audit action
- Add migration for ConsentForm collection indexes
