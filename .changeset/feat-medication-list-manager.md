---
"web": minor
---

feat(medications): medication list manager (#1314)

- New `/medications` workspace with patient switcher and eight tabs
  (active list, add, history, refills, adherence, side effects,
  reconciliation, pharmacy export)
- `MedicationSearch` autocomplete over the local formulary (ARIA combobox,
  keyboard navigation, brand/generic/class matching)
- `MedicationForm` with dosage, frequency, route, quantity and refill inputs
- Real-time `checkInteractions` engine with severity ranking; warnings render
  the moment a drug is selected and major findings require explicit override
- `InteractionWarnings` inline alert list plus a regimen-wide interaction review
- `MedicationHistory` audit trail (starts, dose changes, refills, side effects,
  discontinuations) filterable by event type and medication
- `DiscontinuationDialog` structured discontinuation workflow that also cancels
  outstanding refills
- `RefillRequests` raise/approve/deny flow with automatic refill decrement
- `AdherenceTracker` with computed adherence rate, category and per-day logging
- `SideEffectReportForm` symptom/severity reporting with report history
- `ReconciliationView` comparing the clinic list with the patient's own list
- `PharmacyExportPanel` CSV hand-off built from active/on-hold medications only
- Domain layer in `src/lib/medications` (formulary, interactions, adherence,
  reconciliation, pharmacy export) with 20 unit tests
- Sidebar entry for the new Medications module
