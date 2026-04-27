---
"api": minor
---

feat: implement HIPAA-compliant patient & clinic data export (45 CFR §164.524)

- GET /api/v1/patients/:id/export?format=json|pdf
- GET /api/v1/clinics/:id/export (SUPER_ADMIN only, ZIP archive)
- Audit logging for every export action
- In-memory rate limiter: 5 exports/hour/clinic
