---
"api": minor
"web": minor
---

feat: implement HIPAA-compliant patient & clinic data export (45 CFR §164.524)

- GET /api/v1/patients/:id/export?format=json|pdf
- GET /api/v1/clinics/:id/export (SUPER_ADMIN only, ZIP archive)
- POST /api/v1/portal/export-request — patient-initiated Right of Access request
- GET /api/v1/portal/export-requests — request history with 30-day SLA tracking
- GET /api/v1/portal/export/download/:token — secure, time-limited download link
- "Download my data" button in the patient portal
- Comprehensive export: demographics, encounters, diagnoses, medications, lab results, immunizations, billing, and payments
- Formats: JSON, PDF, CSV, and FHIR R4
- Async export for large records with email notification when the export is ready
- Secure download link with 30-day expiry delivered by email (never the data as an attachment)
- Audit logging (DATA_EXPORT_REQUEST / DATA_EXPORT_FULFILLED) for every export action
- In-memory rate limiter: 5 exports/hour/clinic
- Tests verifying exports contain complete and anonymized-where-appropriate data
---