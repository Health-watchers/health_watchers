# Staff & User Management — Design Spec

> **GitHub Issue:** [#1397](https://github.com/Health-watchers/health_watchers/issues/1397)  
> **Labels:** design, figma  
> **Difficulty:** Medium

---

## Overview

The API already exposes staff management endpoints via `modules/users/user-management.controller.ts`, but there are no designs for inviting, editing, deactivating, or re-assigning roles to clinic staff. This document specifies the design requirements for the Staff & User Management screens that the frontend implementation will be built from.

Roles are defined in `apps/api/src/middlewares/rbac.middleware.ts`. Existing designs live in `UI Designs/Health Watchers Design System - Screens`.

---

## Screen 1 — Staff List

The staff list is the primary landing view for this section. It presents a tabular layout on desktop and a card-stack layout on mobile.

### Table Columns (Desktop)

| Column | Description |
|---|---|
| **Avatar + Name** | Circular avatar (initials fallback) alongside the staff member's full name |
| **Role Badge** | Colour-coded pill using role colours from the design-system token set |
| **MFA Status** | Icon + label: Enabled (green checkmark) / Not enabled (amber warning) |
| **Last Login** | Relative timestamp (e.g. "2 hours ago") with an absolute tooltip on hover |
| **Status** | Status chip: Active / Invited / Deactivated |
| **Actions** | Overflow menu (⋯) — Edit, Resend invite, Deactivate, View detail |

### Filters & Controls

- Search input (name or email)
- Role filter (multi-select dropdown)
- Status filter (Active / Invited / Deactivated / All)
- Clinic filter (visible to multi-clinic admins only)
- "Invite staff" primary button (top-right)

### Status Chip Definitions

| Status | Colour Token | Meaning |
|---|---|---|
| Active | `color.status.success` | Staff member has accepted the invite and is currently active |
| Invited | `color.status.warning` | Invite email has been sent; account not yet activated |
| Deactivated | `color.status.neutral` | Account access has been revoked |

### Empty, Loading & Error States

| State | Treatment |
|---|---|
| **Loading** | Skeleton rows (avatar, name, and badge placeholders) for the number of rows that fit the viewport |
| **Empty — No staff** | Centered illustration + "No staff members yet" heading + "Invite your first team member" CTA |
| **Empty — Filtered** | Centered icon + "No results match your filters" + "Clear filters" text link |
| **Error** | Inline error banner with retry action; table area shows a muted placeholder |

---

## Screen 2 — Invite Staff Modal

Triggered by the "Invite staff" button on the staff list. Presented as a centered modal overlay.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| Email address | Text input | Yes | Validated as a valid email; checked against existing accounts |
| Role | Single-select dropdown | Yes | Lists roles from `rbac.middleware.ts` |
| Clinic assignment | Single-select dropdown | No (multi-clinic admin only) | Hidden for single-clinic admins |

### Behaviour

- "Send invite" triggers the invite API call and closes the modal on success.
- A success toast confirms: _"Invite sent to name@example.com."_
- If the email already exists (active or invited), an inline field error is displayed: _"This email already has an account."_
- If the email belongs to a deactivated account, the error reads: _"This account is deactivated. Reactivate from the staff list instead."_

### Actions

- **Send invite** (primary) — disabled until all required fields are valid
- **Cancel** (secondary) — closes modal, discards input

---

## Screen 3 — Staff Detail Drawer

Opens as a right-side drawer when a staff row is clicked or "Edit" is selected from the overflow menu. Remains on top of the staff list (no navigation away from the list).

### Header

- Large avatar (or initials), full name, current role badge, and status chip
- "Close" button (X) top-right of the drawer

### Sections

#### Role & Assignment

- Role selector (single-select, same options as invite modal)
- Clinic assignment (multi-clinic admins only)
- "Save changes" button — saves role/clinic changes in-place with an inline success state

#### Security

| Action | Button Style | Confirmation Required |
|---|---|---|
| Force password reset | Secondary | Confirmation dialog |
| Revoke all active sessions | Secondary, destructive colour | Confirmation dialog |

#### Account Status

| Action | Visibility | Button Style |
|---|---|---|
| Deactivate account | Active accounts only | Danger/destructive |
| Reactivate account | Deactivated accounts only | Secondary |

#### Audit Trail (read-only)

- Last login timestamp and IP address
- MFA last enabled/disabled timestamp
- Account created date and inviting admin name

---

## Screen 4 — Confirmation Dialogs

All destructive actions use a consistent confirmation dialog pattern.

### Dialog Structure

```
┌──────────────────────────────────────┐
│  [Icon]  [Action Title]              │
│                                      │
│  [Consequence description — 1–2      │
│   sentences explaining what will     │
│   happen and whether it is           │
│   reversible.]                       │
│                                      │
│            [Cancel]  [Confirm]       │
└──────────────────────────────────────┘
```

### Dialog Variants

| Action | Title | Confirm Button Label | Reversible? |
|---|---|---|---|
| Deactivate account | "Deactivate [Name]?" | "Deactivate" | Yes — admin can reactivate |
| Force password reset | "Force password reset?" | "Send reset email" | N/A |
| Revoke sessions | "Sign out all sessions?" | "Revoke sessions" | No — user must re-authenticate |

---

## Mobile Layout (≤ 400 px)

| Screen | Mobile Treatment |
|---|---|
| Staff list | Card stack; each card shows avatar, name, role badge, and status chip; tap opens the detail drawer as a full-screen sheet |
| Invite modal | Full-screen sheet with the same fields |
| Detail drawer | Full-screen sheet; sections are vertically stacked; destructive actions are at the bottom |
| Confirmation dialog | Bottom sheet on mobile instead of centered modal |

All touch targets are a minimum of 44 × 44 px (WCAG 2.5.5).

---

## Accessibility Requirements

- Role badges and status chips use both colour and text — colour alone is never the sole indicator.
- The staff list table uses `role="grid"` with appropriate `aria-colindex` and `aria-rowindex` on cells.
- The drawer is a `role="dialog"` with `aria-labelledby` pointing to the staff member's name heading; focus is trapped within the drawer while it is open and returns to the triggering row on close.
- Confirmation dialogs are `role="alertdialog"` with `aria-describedby` pointing to the consequence text.
- All interactive controls meet WCAG 2.1 AA colour-contrast ratios (minimum 4.5:1 for text, 3:1 for UI components).
- Skeleton loaders include `aria-busy="true"` on the container region and a visually-hidden loading label for screen readers.

---

## Design-System Constraints

- Only existing design-system components and tokens may be used.
- Any net-new component introduced must be documented with its token mapping, variants, and usage guidelines before the Figma frames are submitted.
- Role badge colours must map to existing `color.role.*` tokens; if a role has no existing token, a new token must be proposed in the Figma handoff notes.

---

## Figma Deliverables

- [ ] Staff list — desktop (default, filtered, empty, loading, error states)
- [ ] Staff list — mobile card stack
- [ ] Invite staff modal — desktop and mobile
- [ ] Staff detail drawer — desktop and mobile (all section variants)
- [ ] Confirmation dialogs — all three variants, desktop and mobile
- [ ] Accessibility annotation layer on all frames

All frames should be placed under **UI Designs / Admin / Staff & User Management** in the shared Figma file and exported as PNG to `UI Designs/`.

---

## Related

- `modules/users/user-management.controller.ts` — backing API endpoints
- `apps/api/src/middlewares/rbac.middleware.ts` — role definitions
- `UI Designs/Health Watchers Design System - Screens` — existing design library
- `docs/design/DATA_VISUALIZATION_GUIDELINES.md` — shared colour and token guidelines
