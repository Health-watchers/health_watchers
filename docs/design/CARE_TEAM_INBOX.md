# Care Team Inbox — Clinician-Side Design Spec

> **GitHub Issue:** [#1400](https://github.com/Health-watchers/health_watchers/issues/1400)  
> **Labels:** design, messaging, figma  
> **Difficulty:** Medium

---

## Overview

Patients can already send messages to their care team through `portal.messaging`, but clinicians currently have no purpose-built interface for receiving, triaging, and replying to those messages. This document specifies the design requirements for the clinician-side Care Team Inbox.

---

## Layout — Three-Pane Inbox

The inbox is structured as three vertical panes rendered side-by-side on desktop (≥ 1024 px). On mobile the panes collapse to a single view with back-navigation between them.

```
┌──────────────┬────────────────────────┬──────────────────────────────┐
│  Folders     │  Thread List           │  Conversation / Composer     │
│  (Sidebar)   │                        │                              │
│              │  ▸ [thread preview]    │  [message history]           │
│  Unassigned  │  ▸ [thread preview]    │                              │
│  Mine        │  ▸ [thread preview]    │  [composer + actions]        │
│  Team        │                        │                              │
│  Closed      │                        │                              │
└──────────────┴────────────────────────┴──────────────────────────────┘
```

### Pane 1 — Folders (Sidebar)

| Folder | Description |
|---|---|
| **Unassigned** | Messages not yet claimed by any clinician |
| **Mine** | Threads assigned to the currently logged-in clinician |
| **Team** | All open threads assigned to any member of the clinician's team |
| **Closed** | Resolved or archived threads |

Each folder label shows an unread badge count.

### Pane 2 — Thread List

Each row in the thread list displays:

- Patient name and avatar (or initials fallback)
- Subject or first message excerpt (truncated to 2 lines)
- Timestamp of the most recent message
- Unread indicator (bold row + colored dot)
- Priority flag (see Priority Flags below)
- Assignee avatar (if assigned)
- SLA indicator (see SLA Indicator below)

The list is sorted by: **Urgent unread → Unread → Read**, then by most-recent-message descending within each group.

### Pane 3 — Conversation & Composer

The conversation view shows the full message thread in a chat-style layout, with:

- Patient messages aligned left, clinician messages aligned right
- Sender name, role, and timestamp on each bubble
- Attachment previews inline (see Attachment Preview below)
- A sticky composer at the bottom of the pane

---

## Thread States

| State | Visual Treatment |
|---|---|
| **Unread** | Bold subject, filled unread dot, highlighted row background |
| **Urgent** | Red priority flag, "URGENT" chip, elevated in sort order |
| **Closed** | Greyed-out row, lock icon, read-only conversation view |
| **Assigned — Mine** | Checkmark/avatar chip showing the clinician's own avatar |
| **Assigned — Other** | Avatar chip showing the assignee |

---

## Assignment & Priority Flags

### Assignment

- A thread can be claimed via an **"Assign to me"** button in the conversation header.
- Clinicians with the correct permissions can reassign a thread to another team member via a dropdown.
- Bulk-assign is available from the thread list via checkbox selection.

### Priority Flags

| Flag | Colour | Meaning |
|---|---|---|
| Urgent | Red | Requires same-day response |
| High | Orange | Requires response within 24 h |
| Normal | (none) | Standard SLA applies |
| Low | Grey | No SLA enforced |

Priority is set manually by the clinician or automatically promoted when the SLA threshold is breached.

---

## Convert to Encounter

Each thread has a **"Convert to Encounter"** action (available in the conversation header action menu). Selecting it:

1. Opens a modal pre-populated with the patient ID and the thread subject as the encounter reason.
2. Allows the clinician to select encounter type (phone, in-person, telemedicine).
3. On confirm, creates an encounter record and links the thread to it.
4. The thread is marked with an "Encounter created" badge and the thread is moved to **Closed** or remains open per the clinician's choice.

---

## Canned Responses

Clinicians can insert pre-written replies via a **"/" shortcut** or a dedicated **"Canned responses"** button in the composer toolbar.

- Responses are searchable by keyword.
- Canned responses can be scoped to: Personal, Team, or Organisation.
- Admins manage the organisation-level library; individual clinicians manage their personal library from their profile settings.
- After selection the response is inserted as editable text in the composer — it is never sent automatically.

---

## Attachment Preview

Attachments sent by the patient or clinician are rendered inline in the conversation:

| File Type | Preview Behaviour |
|---|---|
| Image (jpg, png, webp) | Thumbnail, click to lightbox |
| PDF | PDF icon + filename + page count, click opens the Secure Document Viewer |
| Other (docx, xlsx, etc.) | Generic file icon + filename + file size, click downloads |

Upload from the composer supports drag-and-drop and the file picker. Max file size and allowed types are enforced client-side and server-side (mirrors the existing `portal.messaging` attachment rules).

---

## SLA Indicator

An SLA indicator is displayed on each thread row and in the conversation header. It shows **time elapsed since the patient's last message**.

| Time Elapsed | Indicator Style |
|---|---|
| < 4 h | Green dot |
| 4–24 h | Amber dot + elapsed time label |
| > 24 h | Red dot + elapsed time label + "SLA breached" tooltip |

The SLA clock pauses while the thread is in **Closed** state. It resets when the patient sends a new message into a closed thread (which reopens it automatically into **Unassigned**).

---

## Mobile Layout

On viewports < 1024 px the three-pane layout collapses to a **single-pane navigation stack**:

1. **Root view** — Folder list
2. **Drill-in** — Thread list for the selected folder
3. **Drill-in** — Conversation view for the selected thread

Navigation uses standard back-button / swipe-back gestures. The composer is a full-width sticky bar above the device keyboard. The SLA indicator, priority flag, and assignee chip are all visible in the thread list rows in a compact form.

A **floating action button (FAB)** in the thread list allows quick composition of a new message (if the clinician is permitted to initiate conversations).

---

## Accessibility Requirements

- All three panes are individually focusable regions with `role="region"` and descriptive `aria-label` attributes.
- **Keyboard navigation between panes:** `Tab` moves focus to the next pane; `Shift+Tab` moves focus to the previous pane. Within a pane, arrow keys navigate between list items.
- Thread list items use `role="listitem"` and announce unread status and priority in the accessible name (e.g. _"Urgent unread message from Jane Doe, 3 hours ago"_).
- Colour is never the sole indicator of state — every colour-coded element (priority flags, SLA dots) has an accompanying text label or icon.
- The composer toolbar buttons have visible focus indicators and descriptive `aria-label` attributes.
- All modals trap focus and return focus to the trigger element on close.
- Minimum touch target size: 44 × 44 px (WCAG 2.5.5).

---

## Figma Deliverables

- [ ] Desktop layout — all three panes, all thread states
- [ ] Mobile layout — folder list, thread list, conversation views
- [ ] Assignment modal
- [ ] Priority flag picker
- [ ] Convert to Encounter modal
- [ ] Canned responses picker
- [ ] Attachment preview states (image, PDF, generic)
- [ ] SLA indicator states (green / amber / red)
- [ ] Accessibility annotation layer

All frames should be placed under **UI Designs / Clinician / Care Team Inbox** in the shared Figma file.

---

## Related

- `apps/portal/src/messaging/` — patient-side messaging implementation
- `docs/design/DATA_VISUALIZATION_GUIDELINES.md` — chart / colour guidelines shared across clinical views
- Issue [#1401](https://github.com/Health-watchers/health_watchers/issues/1401) — Mobile screens (Login, Appointments, Profile)
