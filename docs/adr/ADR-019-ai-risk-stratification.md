# ADR-019: AI-Powered Risk Stratification

## Status

Accepted

## Date

2024-06-25

## Context

Early identification of high-risk patients allows clinical teams to proactively allocate resources — scheduling follow-ups, increasing monitoring frequency, or escalating to specialist care. Manual risk assessment by clinicians is time-consuming and inconsistent across practitioners.

An automated risk stratification system is needed that:

- Calculates a 0–100 risk score and a risk level (low / medium / high / critical) per patient
- Updates the score as new clinical data arrives (new encounters, lab results, vitals)
- Is explainable — clinicians need to understand why a patient is high-risk, not just that they are
- Does not replace clinical judgement — it augments it
- Never sends raw PHI to an external AI provider

## Decision

### Hybrid approach: rule-based engine + Gemini AI

Risk stratification uses a two-component architecture:

**Component 1: Rule-based CDS engine**

A Clinical Decision Support (CDS) engine evaluates deterministic rules against patient data:

- Chronic condition flags (diabetes, hypertension, COPD from diagnosis codes)
- Vital sign thresholds (blood pressure > 140/90, SpO2 < 95 %)
- Lab result ranges (HbA1c > 7 %, eGFR < 60)
- Medication interaction flags
- Age and comorbidity combinations

Rules are stored in the `cds_rules` collection and seeded by `seedBuiltInRules()` at startup. New rules can be added without code changes. Each rule has a weight; the weighted sum contributes to the overall risk score.

**Component 2: Gemini AI (Google)**

For complex narrative analysis (free-text SOAP notes, patient-reported symptoms), the rule engine cannot capture nuance. Google's **Gemini API** (`GEMINI_API_KEY`) is used to analyse anonymised clinical text and return additional risk signals.

**PHI handling for Gemini**:

- All PHI is stripped from the text before sending to Gemini using `@health-watchers/anonymize`
- Identifiers (names, DOBs, addresses, MRNs) are replaced with placeholder tokens
- Only anonymised text is transmitted; no structured patient record is sent
- `GEMINI_API_KEY` is optional — if absent, the system operates in rule-only mode

### Risk score calculation

```
riskScore (0–100) = Σ(rule_weight × rule_match) + gemini_risk_signal
riskLevel = riskScore < 25 → 'low'
           riskScore < 50 → 'medium'
           riskScore < 75 → 'high'
           riskScore ≥ 75 → 'critical'
```

`riskFactors[]` is populated with the human-readable reasons that contributed to the score (e.g. `"HbA1c > 7.5 %"`, `"Hypertension + Age > 65"`).

### Recalculation triggers

Risk scores are recalculated:

1. **Immediately** when a new encounter is closed or a lab result is added (inline async call)
2. **Periodically** by `startRiskRecalculationJob()` — a background job that recalculates all patients for a clinic on a schedule (catches cases where rules are updated but patient data has not changed)

The recalculation job is designed to be idempotent; running it multiple times produces the same result.

### Storage

`riskScore`, `riskLevel`, and `riskFactors` are stored as fields on the `patients` collection and indexed for efficient filtering:

```
{ clinicId: 1, riskLevel: 1 }   — filter high-risk patients per clinic
{ clinicId: 1, riskScore: -1 }  — sort patients by risk score descending
```

### Clinical transparency

The `riskFactors` array is displayed in the clinical UI alongside the score, giving clinicians a direct explanation of the contributing factors. The AI signal is labelled as "AI-assisted analysis" to distinguish it from deterministic rule output.

## Consequences

### Positive

- Rule-based component is deterministic, auditable, and explainable.
- Gemini AI handles narrative complexity that rules cannot capture.
- Anonymisation layer ensures raw PHI never leaves the application to third-party AI providers.
- `GEMINI_API_KEY` being optional means the platform remains fully functional without the AI component.
- `riskFactors` array makes the model's reasoning transparent to clinicians.

### Negative / Trade-offs

- Gemini AI responses introduce non-determinism; the same input may produce slightly different scores on different calls. The rule-based component provides a deterministic floor.
- Anonymisation is imperfect for rare diseases or very specific clinical narratives where the condition itself is identifying. The anonymisation library must be continuously improved.
- AI-generated risk signals are not validated against clinical outcomes; the system is decision-support only, not diagnostic.
- Adding new CDS rules requires careful calibration of weights to avoid inflating scores.

### Neutral

- The `cds_rules` collection can be extended by SUPER_ADMIN without a code deployment, allowing rapid clinical guideline updates.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Rules only (no AI) | Misses patterns in free-text clinical notes that are clinically significant |
| Proprietary clinical AI model (e.g. Amazon Comprehend Medical) | Higher cost; Gemini provides good narrative understanding with lower per-request cost |
| On-premise ML model | High operational complexity; requires clinical data scientists to train and validate; Gemini is sufficient for the current scope |
| Sending structured patient records to Gemini | Violates HIPAA PHI-in-third-party-AI constraints; anonymisation is required |

## References

- `apps/api/src/modules/patients/risk-recalculation-job.ts`
- `apps/api/src/modules/cds/cds-seed.ts`
- `apps/api/src/config/env.ts` — `GEMINI_API_KEY`
- `packages/anonymize/` — PHI anonymisation utilities
- `docs/DATABASE_SCHEMA.md` — `patients.riskScore`, `patients.riskFactors`
- `.changeset/feat-ai-risk-stratification.md`
