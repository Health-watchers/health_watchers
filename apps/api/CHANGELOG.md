# api

## 1.1.0

### Minor Changes

- 3dd24bd: feat: AI risk stratification for patients
  - Add riskScore, riskLevel, riskFactors, lastRiskCalculatedAt, nextRiskReviewDate to patient model
  - Add RiskScoreHistory model to track score changes over time
  - POST /api/v1/ai/risk-assessment — AI-powered risk assessment via Gemini (PII stripped)
  - GET /api/v1/patients/:id/risk-history — fetch score history
  - Weekly background job recalculates all active patients and notifies CLINIC_ADMIN of escalations
  - Add high_risk_patient notification type
  - Risk level badge on patient list table
  - Risk tab on patient detail page with factor breakdown and history
  - High-risk patient list on dashboard
  - Tests cover all risk scoring factors and level thresholds

- 5ac79e6: feat: implement HIPAA-compliant patient & clinic data export (45 CFR §164.524)
  - GET /api/v1/patients/:id/export?format=json|pdf
  - GET /api/v1/clinics/:id/export (SUPER_ADMIN only, ZIP archive)
  - Audit logging for every export action
  - In-memory rate limiter: 5 exports/hour/clinic

- 2292a2c: feat: implement payment dispute and refund system
  - POST /api/v1/payments/:intentId/dispute — open a dispute
  - GET /api/v1/payments/disputes — list disputes (CLINIC_ADMIN+)
  - PUT /api/v1/payments/disputes/:id/resolve — resolve dispute
  - POST /api/v1/payments/disputes/:id/refund — issue Stellar reverse transaction refund
  - Refunds limited to 30 days, partial refunds supported
  - Audit logging for DISPUTE_OPENED, DISPUTE_RESOLVED, REFUND_ISSUED
  - Email notifications on dispute opened/resolved
  - Dispute management page in frontend
