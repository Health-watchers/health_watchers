---
"api": minor
"web": minor
"stellar-service": minor
---

feat: implement payment dispute and refund system

- POST /api/v1/payments/:intentId/dispute — open a dispute
- GET /api/v1/payments/disputes — list disputes (CLINIC_ADMIN+)
- PUT /api/v1/payments/disputes/:id/resolve — resolve dispute
- POST /api/v1/payments/disputes/:id/refund — issue Stellar reverse transaction refund
- Refunds limited to 30 days, partial refunds supported
- Audit logging for DISPUTE_OPENED, DISPUTE_RESOLVED, REFUND_ISSUED
- Email notifications on dispute opened/resolved
- Dispute management page in frontend
