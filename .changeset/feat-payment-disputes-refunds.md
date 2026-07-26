---
"api": minor
"web": minor
"stellar-service": minor
---

feat: implement payment dispute and refund system

- POST /api/v1/payments/:intentId/dispute — open a dispute
- GET /api/v1/payments/disputes — list disputes (CLINIC_ADMIN+)
- POST /api/v1/payments/disputes/:disputeId/evidence — submit evidence (starts 7-day review period)
- PUT /api/v1/payments/disputes/:id/resolve — resolve dispute (enforces review period; auto-refunds on patient-favored resolution)
- POST /api/v1/payments/disputes/:id/refund — issue Stellar reverse transaction refund
- Refunds limited to 30 days, partial refunds supported
- Structured resolution record (outcome, notes, refund) + dispute status surfaced on payment receipt
- Audit logging for DISPUTE_OPENED, DISPUTE_RESOLVED, REFUND_ISSUED
- Email notifications on dispute opened/evidence submitted/resolved
- Dispute management page in frontend
