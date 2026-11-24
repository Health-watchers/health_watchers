# Insurance Claims & Billing Workbench — Design Spec

> **GitHub Issue:** [#1399](https://github.com/Health-watchers/health_watchers/issues/1399)  
> **Labels:** design, billing, figma  
> **Difficulty:** Medium

---

## Overview

The billing module already handles claim building, aging reports, and a full billing workflow (`modules/billing/*`), but there is no UI for any of it. Billing staff need a workbench where they can find unbilled encounters, submit claims to payers, work denials, and monitor aging. This document specifies the design requirements for that workbench.

---

## Layout

The workbench is a full-width page with a sticky top navigation and a main content area that changes based on the active view.

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Page Header: "Billing Workbench"]          [Bulk Actions]  [+New] │
├──────────┬────────────┬────────────┬─────────────────────────────── │
│ Unbilled │ Submitted  │  Denied    │  Paid                           │
│  (count) │  (count)   │  (count)   │  (count)                        │
├──────────┴────────────┴────────────┴──────────────────────────────┤ │
│                                                                      │
│  [Filter bar]                           [Search]  [Date range]      │
│                                                                      │
│  [Claims table / card list]                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Screen 1 — Work Queues

Four tab-based work queues are the entry point for all billing activity. Each tab displays a count badge reflecting the number of claims in that state.

### Tab Definitions

| Tab | Meaning | Primary Action Available |
|---|---|---|
| **Unbilled** | Encounters that have been completed but not yet submitted as a claim | "Create claim" |
| **Submitted** | Claims that have been sent to a payer and are awaiting adjudication | "View status" |
| **Denied** | Claims returned by the payer with a denial reason code | "Correct & resubmit" |
| **Paid** | Claims that have been fully adjudicated and payment posted | "View EOB" |

### Queue Table Columns

| Column | Description |
|---|---|
| Checkbox | For bulk-select actions |
| Patient | Patient name + MRN |
| Date of Service | Encounter date |
| Payer | Insurance carrier name |
| Amount Billed | Total billed amount (formatted per money pattern — see below) |
| Amount Paid | Paid amount (Paid tab only) |
| Status | Status chip |
| Age | Days since claim creation |
| Actions | Context-sensitive action button + overflow menu |

### Filters

- Date range picker (date of service or submission date, toggle between the two)
- Payer (multi-select)
- Provider / rendering clinician (multi-select)
- Clinic location (multi-clinic practices)
- Claim amount range (min / max)

---

## Screen 2 — Claim Detail View

Opened by clicking any claim row. Presented as a full-page view (not a drawer) to accommodate the volume of information.

### Header

- Patient name, MRN, date of service, and payer name
- Current status chip with last-updated timestamp
- Primary action button (context-sensitive — e.g. "Submit", "Correct & resubmit", or "Write off")
- Overflow menu: Print, Export PDF, Add note, Void claim

### Section: Claim Lines

A table listing each service line on the claim:

| Column | Description |
|---|---|
| # | Line number |
| CPT Code | Procedure code |
| ICD-10 | Diagnosis code(s) linked to this line |
| Description | Short description of the service |
| Units | Quantity |
| Billed | Per-line billed amount |
| Allowed | Allowed amount (populated after adjudication) |
| Paid | Paid amount (populated after adjudication) |
| Adjustment | Contractual adjustment or write-off amount |

The footer row totals all monetary columns.

### Section: Payer & Coverage

- Payer name, payer ID, plan name
- Member ID, group number
- Coordination of Benefits (COB) indicator if a secondary payer exists
- Prior authorization number (if applicable)

### Section: Status History

A chronological timeline of status changes:

```
● Created          2026-09-10 09:14  by Sarah Chen
● Submitted        2026-09-10 11:02  by Sarah Chen
● Denied           2026-09-14 08:30  [Payer: CO-16 — missing referral]
● Corrected        2026-09-18 14:45  by Marcus Rivera
● Resubmitted      2026-09-18 14:46  by Marcus Rivera
```

### Section: Attachments

- List of attached documents (referral letters, prior auth approvals, clinical notes)
- Upload button (drag-and-drop + file picker)
- Each attachment shows file name, file type icon, upload date, and uploader name

---

## Screen 3 — Denial Workflow

Triggered by clicking "Correct & resubmit" on a denied claim. Presented as a step-by-step flow within the claim detail view.

### Step 1 — Review Denial

- Display the denial reason code and its human-readable description (e.g. `CO-16: Claim/service lacks information which is needed for adjudication`)
- Show the specific claim lines affected (highlighted in the claim lines table)
- Display any payer remarks or remittance advice notes

### Step 2 — Correct the Claim

- Inline editing of the affected claim lines (CPT, ICD-10, units, amounts)
- Ability to attach missing documentation
- Correction note field (required) — free text to document what was changed and why

### Step 3 — Choose Next Action

Two paths are available at this step:

#### Option A — Correct & Resubmit

- Review a diff of the original vs. corrected claim lines
- "Resubmit claim" button — sends the corrected claim to the payer
- Status transitions to **Submitted**

#### Option B — Write Off

When a denial is not worth pursuing (e.g. timely filing limit exceeded, patient not eligible), the balance can be written off.

| Field | Type | Required | Notes |
|---|---|---|---|
| Write-off reason | Dropdown | Yes | E.g. Contractual adjustment, Bad debt, Timely filing, Patient hardship |
| Write-off amount | Currency input | Yes | Defaults to the denied balance |
| Justification note | Textarea | Yes | Minimum 10 characters |
| Authorising user | Read-only | — | Auto-populated from the logged-in user |

Confirmation dialog is required before a write-off is finalised (see Confirmation Pattern below).

---

## Screen 4 — Aging Report

Accessible from the main workbench navigation or as a tab alongside the work queues. Provides a visual and tabular breakdown of outstanding claim balances by age bucket.

### Visual — Stacked Bar Chart

A horizontal stacked bar chart showing total outstanding balance broken down by age bucket and payer. The chart uses design-system data-viz tokens.

| Bucket | Colour Token | Range |
|---|---|---|
| Current | `color.dataviz.positive` | 0 – 30 days |
| 31–60 | `color.dataviz.caution` | 31 – 60 days |
| 61–90 | `color.dataviz.warning` | 61 – 90 days |
| 90+ | `color.dataviz.critical` | Over 90 days |

Hovering a bar segment shows a tooltip with the payer name, bucket, count of claims, and total dollar amount.

### Tabular Breakdown

Below the chart, a table lists each payer as a row with columns for each age bucket plus a total. Rows are sortable by any column. Clicking a payer row navigates to the Submitted/Denied queues pre-filtered to that payer.

### KPI Tiles (top of aging report)

| Tile | Value |
|---|---|
| Total outstanding | Sum of all unbilled + submitted + denied |
| 90+ days | Total in the oldest bucket (highest collection risk) |
| Average days to pay | Rolling 90-day average across all payers |
| Denial rate | Denied ÷ submitted in the last 30 days (percentage) |

---

## Bulk-Select Actions

When one or more claim checkboxes are selected, a bulk actions bar appears above the table.

| Action | Available on Tabs | Confirmation Required |
|---|---|---|
| Submit selected | Unbilled | Yes — shows count and total billed amount |
| Resubmit selected | Denied | Yes — shows count |
| Write off selected | Denied | Yes — requires shared justification note |
| Export selected (CSV) | All | No |
| Print selected | All | No |

The bulk actions bar shows the count of selected items and a "Clear selection" link. Selecting the header checkbox selects all items on the current page (not all pages).

---

## Money Formatting Pattern

All monetary values in the workbench follow a documented pattern to ensure consistency across fiat and cryptocurrency display.

### Fiat (USD)

- Format: `$1,234.56` (symbol prefix, comma thousands separator, two decimal places)
- Negative amounts (adjustments, write-offs): `($1,234.56)` — parentheses, no minus sign
- Zero: `$0.00`
- Use `en-US` locale formatting via `Intl.NumberFormat`

### XLM / USDC (Stellar)

- Format: `1,234.5678900 XLM` or `1,234.56 USDC` (symbol suffix, seven decimal places for XLM, two for USDC)
- Always show the currency ticker as a suffix
- Do not mix fiat and crypto in the same table column; use separate columns or a currency indicator chip

### Shared Rules

- Never truncate or abbreviate monetary values in a detail view (e.g. do not display `$1.2K`)
- Summary tiles and chart tooltips may use abbreviations (`$1.2K`, `$3.4M`) with the full value in a tooltip
- Currency type is always explicitly labelled — never rely on context alone

---

## Confirmation Pattern

Destructive or irreversible billing actions use a two-step confirmation:

```
┌───────────────────────────────────────────┐
│  ⚠️  [Action Title]                        │
│                                           │
│  [Description of what will happen and     │
│   whether it can be undone.]              │
│                                           │
│  Affects: [X claims, $X total]            │
│                                           │
│              [Cancel]  [Confirm action]   │
└───────────────────────────────────────────┘
```

The confirm button uses the destructive colour token and is disabled for 1.5 seconds after the dialog opens to prevent accidental double-clicks.

---

## Accessibility Requirements

- Work queue tabs use `role="tablist"` / `role="tab"` / `role="tabpanel"` with proper `aria-selected` and `aria-controls` attributes.
- Count badges on tabs are announced by screen readers: _"Denied, 14 claims"_.
- The claims table uses `role="grid"` with `aria-sort` on sortable columns.
- Bulk-select checkboxes have descriptive `aria-label` values: _"Select claim for Patient Name, $X"_.
- The aging chart is accompanied by a data table that presents the same information in text form for screen reader users.
- All colour-coded age buckets use both colour and a text label — colour alone is never the sole differentiator.
- Money values use `aria-label` to provide the full amount when display values are abbreviated (e.g. `aria-label="$1,234,567.89"` on a tile showing `$1.2M`).
- All confirmation dialogs are `role="alertdialog"` with focus trapped inside.
- Minimum touch target: 44 × 44 px (WCAG 2.5.5).
- All interactive elements meet WCAG 2.1 AA colour-contrast ratios.

---

## Figma Deliverables

- [ ] Work queues — all four tabs (default, filtered, empty, loading, error states)
- [ ] Claim detail view — all sections (claim lines, payer info, status history, attachments)
- [ ] Denial workflow — all three steps (review, correct, choose action)
- [ ] Write-off form and confirmation dialog
- [ ] Aging report — KPI tiles, stacked bar chart, tabular breakdown
- [ ] Bulk-select action bar — all action variants
- [ ] Confirmation dialogs — submit, resubmit, write-off variants
- [ ] Mobile-responsive layouts for queue and claim detail
- [ ] Accessibility annotation layer

The Figma prototype must link: **Queue → Claim Detail → Resubmit flow** end-to-end.

All frames should be placed under **UI Designs / Billing / Insurance Claims Workbench** in the shared Figma file.

---

## Related

- `modules/billing/*` — backing API endpoints (claim building, aging, workflow)
- `docs/design/DATA_VISUALIZATION_GUIDELINES.md` — chart and colour token guidelines
- `docs/payments-architecture.md` — Stellar / USDC payment architecture
- Issue [#1398](https://github.com/Health-watchers/health_watchers/issues/1398) — Audit Log Explorer & Compliance Center (shares KPI tile pattern)
