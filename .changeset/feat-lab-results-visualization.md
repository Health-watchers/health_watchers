---
"web": minor
---

feat(lab-results): interactive lab results visualisation (#1313)

- New `/lab-results` workspace with patient switcher and tabs for results,
  trends, comparison, interpretation guide, history and export
- `LabResultsTable` with reference ranges, normal/critical flags and critical
  row highlighting
- `LabResultsFilters` for full-text search across tests, panels and clinicians
  plus panel, status, date range, abnormal-only and critical-only filters
- `ReferenceRangeIndicator` rendering the reference interval, critical zones
  and a marker for the measured value
- `CriticalValueBanner` announcing critical results immediately on page load
- `LabTrendChart` (lazy-loaded recharts) plotting an analyte against its
  normal range with rising/falling/stable direction and percent change
- `ResultsComparison` delta-ing two reports analyte by analyte
- `InterpretationGuide` with plain-language guidance per analyte
- `LabHistoryTimeline` grouping reports by collection date
- `LabResultsExport` CSV export with abnormal/critical counts and a preview
- Domain layer in `src/lib/lab-results` (types, 18-analyte reference table,
  evaluation, export, sample data) with 13 unit tests
- Sidebar navigation entry for the new Lab Results module
