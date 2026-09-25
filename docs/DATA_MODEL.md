# Data Model

Core entities:

- Tenant: organization boundary for clinics and partners.
- User: authenticated actor tied to a tenant and role.
- Patient: PHI-bearing clinical record.
- Encounter: visit or telehealth session.
- AuditEvent: immutable record of sensitive actions.

All PHI-bearing models require tenant scoping, audit metadata, retention classification, and encryption coverage.
