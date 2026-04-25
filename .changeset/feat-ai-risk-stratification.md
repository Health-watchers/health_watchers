---
"api": minor
"web": minor
---

feat: AI risk stratification for patients

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
