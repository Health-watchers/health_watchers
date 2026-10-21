# Audit Log Explorer & Compliance Center — Design Spec

> **GitHub Issue:** [#1398](https://github.com/Health-watchers/health_watchers/issues/1398)  
> **Labels:** design, compliance, figma  
> **Difficulty:** Medium

---

## Overview

HIPAA audit logs, breach incidents, and Business Associate Agreement (BAA) records are already stored and managed by the API (`modules/audit`, `modules/breach-incidents`, `modules/compliance`), but compliance officers currently have no screens to review them. This document specifies the design requirements for the Audit Log Explorer and Compliance Center, covering three distinct sub-areas: audit logs, breach incident management, and the BAA registry — all surfaced through a unified Compliance Center landing page.

---

## Compliance Center — Landing Page

The landing page is the entry point for all compliance activity. It presents KPI tiles and navigation cards to each sub-area.

### KPI Tiles

| Tile | Value | Source |
|---|---|---|
| Open incidents | Count of breach incidents not in **Closed** state | `modules/breach-incidents` |
| BAAs expiring in 30 days | Count of BAAs with `expiresAt` within the next 30 days | `modules/compliance` |
| Audit anomalies | Count of flagged anomalous audit events in the last 7 days | `modules/audit` |

Each tile is interactive — clicking it navigates to the relevant sub-area with an appropriate pre-applied filter.

Tile states:

| Tile Value | Visual Treatment |
|---|---|
| 0 (all clear) | Neutral background, no alert indicator |
| > 0 (attention required) | Warning/danger background token, count in bold, icon |

Tiles use both colour and an icon to signal status — colour alone is never the sole indicator.

### Navigation Cards

Below the KPI tiles, three navigation cards link to the three sub-areas:

- **Audit Log Explorer** — "Search and export HIPAA audit logs"
- **Breach Incident Board** — "Track, investigate, and close breach incidents"
- **BAA Registry** — "Manage vendor agreements and expiry dates"

Each card shows the relevant KPI count as a badge.

---

## Sub-Area 1 — Audit Log Explorer

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Audit Log Explorer                        [Export report ▾]         │
├──────────────────────────────────────────────────────────────────────┤
│  [Date range picker]  [User ▾]  [Action ▾]  [Resource ▾]  [Patient ▾]│
│  [IP address]                              [Apply]  [Clear filters]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Results table — see columns below]                                 │
│                                                                      │
│  [Expanded row — JSON diff view]                                     │
│                                                                      │
│  [Pagination]                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Filters

| Filter | Input Type | Description |
|---|---|---|
| Date range | Date range picker (start / end, with presets: Today, Last 7 days, Last 30 days, Custom) | Filters by event timestamp |
| User | Searchable multi-select | Staff member who performed the action |
| Action | Multi-select dropdown | E.g. READ, CREATE, UPDATE, DELETE, LOGIN, EXPORT |
| Resource | Multi-select dropdown | E.g. Patient, Appointment, Medication, Document, User |
| Patient | Searchable single-select | PHI-related filter; searches by patient name or MRN |
| IP address | Text input | Exact match or CIDR range |

### Results Table

| Column | Description |
|---|---|
| Timestamp | Full ISO 8601 timestamp |
| User | Staff member name + role badge |
| Action | Action type chip (colour-coded by category — see below) |
| Resource | Resource type + resource ID |
| Patient | Patient name / MRN (masked to first name + last initial unless the user has full PHI access) |
| IP Address | Source IP |
| Outcome | Success / Failure chip |
| ▸ (expand) | Expand icon to show the JSON diff view |

#### Action Type Colour Coding

Colour alone is never the sole indicator — each action type also has a label and an icon.

| Category | Colour Token | Actions |
|---|---|---|
| Read / View | `color.dataviz.info` | READ, EXPORT, DOWNLOAD |
| Write | `color.dataviz.caution` | CREATE, UPDATE |
| Delete | `color.dataviz.critical` | DELETE, VOID, REVOKE |
| Auth | `color.dataviz.neutral` | LOGIN, LOGOUT, MFA |
| Admin | `color.dataviz.warning` | ROLE_CHANGE, INVITE, DEACTIVATE |

### Expandable JSON Diff View

Clicking the expand icon on a row reveals the before/after JSON diff for the audit event:

- Green highlight for added fields / values
- Red highlight for removed fields / values
- Unchanged fields are shown in a muted colour
- The raw JSON is copyable via a "Copy JSON" button
- PHI fields are redacted to `[REDACTED]` for users without full PHI access

### Export Audit Report Flow

Triggered by the "Export report" button. A two-step modal:

**Step 1 — Scope Summary**

- Shows the current filter state (date range, users, actions, resources)
- Displays the count of records that will be exported
- Format selector: CSV or PDF
- Warning if the export will exceed 10,000 rows: _"Large exports may take several minutes. You will receive a notification when the file is ready."_

**Step 2 — Confirm & Export**

- "Export" button triggers the export job
- A progress indicator appears in the notification area
- On completion, a toast notification with a download link

---

## Sub-Area 2 — Breach Incident Board

### Layout

A Kanban-style board with status columns. Incidents can be moved between columns by drag-and-drop or via the incident detail page.

```
┌─────────────┬─────────────────┬──────────────┬─────────────┐
│  Reported   │  Investigating  │  Notified    │  Closed     │
│  (count)    │  (count)        │  (count)     │  (count)    │
│             │                 │              │             │
│ [card]      │ [card]          │ [card]       │ [card]      │
│ [card]      │ [card]          │              │ [card]      │
│ [+ Add]     │                 │              │             │
└─────────────┴─────────────────┴──────────────┴─────────────┘
```

### Status Column Definitions

| Column | Meaning |
|---|---|
| **Reported** | Incident has been logged; initial triage not yet started |
| **Investigating** | Incident is under active investigation |
| **Notified** | Affected individuals and/or HHS have been notified per HIPAA requirements |
| **Closed** | Incident is fully resolved and documented |

Status labels and column headers use both colour and text/icon — colour alone is never the sole indicator.

### Incident Card (Board View)

Each card on the board shows:

- Incident ID and short title
- Severity chip: Critical / High / Medium / Low (colour + icon + text)
- Reported date
- Assignee avatar
- **60-day notification countdown** (see below)
- Number of affected individuals

### 60-Day Notification Countdown

HIPAA requires notification to affected individuals within 60 days of discovering a breach. The countdown is displayed on every incident card and in the incident detail header.

| Time Remaining | Display |
|---|---|
| > 30 days | Green chip: "X days remaining" |
| 10 – 30 days | Amber chip: "X days remaining" with warning icon |
| < 10 days | Red chip: "X days remaining" with urgent icon |
| 0 days / overdue | Red chip: "OVERDUE — notification required" with alert icon |

The countdown is not shown for incidents in **Closed** state.

### Incident Detail Page

Clicking an incident card opens the full detail page.

**Header**

- Incident ID, title, severity chip, status chip with current column
- 60-day countdown (prominent, top-right)
- "Move to next stage" primary button
- Overflow menu: Edit, Assign, Print, Close incident

**Sections**

| Section | Content |
|---|---|
| Summary | Description, discovery date, reported by, assignee |
| Affected Individuals | Count, list (paginated), and demographic breakdown |
| Timeline | Chronological log of status changes, notes, and notifications sent |
| Notifications | Record of notifications sent: date, method (email/mail/phone), recipient category |
| Documentation | Attached files (investigation reports, legal correspondence, HHS filing confirmation) |
| Notes | Free-text notes with author and timestamp |

---

## Sub-Area 3 — BAA Registry

### Layout

A searchable, sortable table listing all Business Associate Agreements.

### Table Columns

| Column | Description |
|---|---|
| Vendor | Vendor / BA name |
| Service Description | Brief description of the service |
| Effective Date | Date the BAA became active |
| Expiry Date | Date the BAA expires |
| Status | Status chip: Active / Expiring Soon / Expired / Pending |
| Document | Icon link to view the uploaded BAA document |
| Actions | Overflow menu: View, Edit, Upload new version, Archive |

### Status Chip Definitions

| Status | Colour Token | Icon | Condition |
|---|---|---|---|
| Active | `color.status.success` | Checkmark | `expiresAt` > 30 days from today |
| Expiring Soon | `color.status.warning` | Clock | `expiresAt` within 30 days |
| Expired | `color.status.critical` | Alert | `expiresAt` is in the past |
| Pending | `color.status.neutral` | Hourglass | BAA is under review / not yet countersigned |

Status uses both colour and an icon — colour alone is never the sole indicator.

### Expiry Warnings

- A persistent banner appears at the top of the BAA registry if any BAAs are expiring within 30 days: _"X agreements are expiring within 30 days. Review them now."_
- The Compliance Center KPI tile also reflects this count.

### Document Upload

Each BAA record supports document attachment:

- Accepted file types: PDF, DOCX
- Max file size: 25 MB
- Version history is maintained — uploading a new document does not delete previous versions
- Each document version shows upload date, uploader name, and a download link
- Documents open in the Secure Document Viewer (not downloaded directly)

---

## Desktop & Tablet Sizes

All three sub-areas are designed for desktop (≥ 1280 px) and tablet (768 – 1279 px) viewports.

| Sub-area | Desktop | Tablet |
|---|---|---|
| Audit Log Explorer | Full table, side-by-side filters | Filters collapse into a filter sheet |
| Breach Incident Board | Four columns visible | Two columns visible; horizontal scroll for remaining |
| BAA Registry | Full table | Reduced columns; secondary columns hidden with a "Show more" control |

Mobile layouts (< 768 px) are out of scope for this issue. If required, a follow-up issue should be raised.

---

## Accessibility Requirements

- KPI tiles use `role="status"` so screen readers announce value changes without interrupting the user.
- The Audit Log results table uses `role="grid"` with `aria-sort` on sortable columns. Expandable rows use `aria-expanded` on the trigger button and `aria-controls` pointing to the diff panel.
- Action type chips and status chips use both colour and a text label — colour alone is never the sole indicator.
- The Breach Incident board columns are `role="region"` with `aria-label` naming each status. Drag-and-drop is supplemented by a keyboard-accessible "Move to…" action in the overflow menu.
- Incident countdown timers use `aria-live="polite"` to announce updates. Critical countdowns (< 10 days) use `aria-live="assertive"`.
- All modals and dialogs trap focus and return focus to the trigger on close.
- Minimum touch target: 44 × 44 px (WCAG 2.5.5).
- All text and UI components meet WCAG 2.1 AA colour-contrast ratios.

---

## Figma Deliverables

- [ ] Compliance Center landing page — KPI tiles (all states) and navigation cards (desktop and tablet)
- [ ] Audit Log Explorer — filter bar, results table, expanded JSON diff view (desktop and tablet)
- [ ] Export audit report modal — both steps
- [ ] Breach Incident Board — all four status columns, incident cards (all severity and countdown states)
- [ ] Incident detail page — all sections, all status variants
- [ ] BAA Registry — full table (all status chip states), expiry warning banner
- [ ] Document upload flow and version history view
- [ ] Accessibility annotation layer on all frames

Handoff notes must list the API endpoint that backs each widget/component (e.g. which `modules/audit`, `modules/breach-incidents`, or `modules/compliance` endpoint drives each data element).

All frames should be placed under **UI Designs / Compliance / Audit Log & Compliance Center** in the shared Figma file.

---

## Related

- `modules/audit` — HIPAA audit log storage and querying
- `modules/breach-incidents` — breach incident management
- `modules/compliance` — BAA registry and compliance records
- `docs/HEALTHCARE_COMPLIANCE_GUIDE.md` — HIPAA compliance overview
- `docs/BAA_TEMPLATE.md` — standard BAA template
- `docs/PHI_HANDLING_GUIDE.md` — PHI access and masking rules
- `docs/design/DATA_VISUALIZATION_GUIDELINES.md` — chart and colour token guidelines
- Issue [#1397](https://github.com/Health-watchers/health_watchers/issues/1397) — Staff & User Management (shares role badge and status chip patterns)
