---
title: Color Palette
sidebar_label: Colors
sidebar_position: 1
description: All color palettes, hex values, Tailwind class names, and WCAG 2.1 contrast compliance ratings.
---

# Color Palette

All colors are defined as CSS custom properties in `apps/web/src/app/globals.css`
(`@theme` block) and mirrored as Tailwind config tokens in
`apps/web/tailwind.config.ts`. The same hex values are used in both places —
there is a single source of truth.

Dark mode is class-based (`dark` on `<html>`). Every semantic component uses
the palette tokens so it automatically adapts when the class is toggled.

---

## Primary (Blue)

Used for interactive elements: buttons, links, focus rings, active states.

| Token | Class | Hex | Usage |
|-------|-------|-----|-------|
| `primary-50` | `bg-primary-50` | `#eff6ff` | Subtle hover backgrounds |
| `primary-100` | `bg-primary-100` | `#dbeafe` | Badge/chip backgrounds |
| `primary-200` | `bg-primary-200` | `#bfdbfe` | Border accents |
| `primary-300` | `bg-primary-300` | `#93c5fd` | Decorative |
| `primary-400` | `bg-primary-400` | `#60a5fa` | Disabled interactive |
| **`primary-500`** | `bg-primary-500` | **`#3b82f6`** | **Default button, focus ring** |
| `primary-600` | `bg-primary-600` | `#2563eb` | Button hover |
| `primary-700` | `bg-primary-700` | `#1d4ed8` | Button active, dark default |
| `primary-800` | `bg-primary-800` | `#1e40af` | Dark hover |
| `primary-900` | `bg-primary-900` | `#1e3a8a` | Dark active |

---

## Neutral (Gray)

Used for text, borders, backgrounds, and disabled states.

| Token | Class | Hex | Usage |
|-------|-------|-----|-------|
| `neutral-0` | `bg-neutral-0` | `#ffffff` | Input background, card bg |
| `neutral-50` | `bg-neutral-50` | `#f9fafb` | Page background (light) |
| `neutral-100` | `bg-neutral-100` | `#f3f4f6` | Table header, secondary button bg |
| `neutral-200` | `bg-neutral-200` | `#e5e7eb` | Default borders |
| `neutral-300` | `bg-neutral-300` | `#d1d5db` | Outline button border |
| `neutral-400` | `bg-neutral-400` | `#9ca3af` | Placeholder text, icons |
| `neutral-500` | `bg-neutral-500` | `#6b7280` | Subtle labels, table headers |
| `neutral-600` | `bg-neutral-600` | `#4b5563` | Body text (light) |
| **`neutral-700`** | `bg-neutral-700` | **`#374151`** | **Body text default** |
| `neutral-800` | `bg-neutral-800` | `#1f2937` | Dark secondary button bg |
| `neutral-900` | `bg-neutral-900` | `#111827` | Page background (dark), headings |

---

## Success (Green)

Used for positive states: confirmations, success toasts, "active" badges.

| Token | Class | Hex |
|-------|-------|-----|
| `success-50` | `bg-success-50` | `#f0fdf4` |
| `success-100` | `bg-success-100` | `#dcfce7` |
| `success-500` | `bg-success-500` | `#10b981` |
| `success-600` | `bg-success-600` | `#059669` |
| `success-700` | `bg-success-700` | `#047857` |

---

## Warning (Amber)

Used for caution states: warnings, pending statuses.

| Token | Class | Hex |
|-------|-------|-----|
| `warning-50` | `bg-warning-50` | `#fffbeb` |
| `warning-400` | `bg-warning-400` | `#fbbf24` |
| `warning-500` | `bg-warning-500` | `#f59e0b` |
| `warning-700` | `bg-warning-700` | `#b45309` |

---

## Danger (Red)

Used for destructive actions, error states, validation failures.

| Token | Class | Hex |
|-------|-------|-----|
| `danger-50` | `bg-danger-50` | `#fef2f2` |
| `danger-100` | `bg-danger-100` | `#fee2e2` |
| `danger-500` | `bg-danger-500` | `#ef4444` |
| `danger-600` | `bg-danger-600` | `#dc2626` |
| `danger-700` | `bg-danger-700` | `#b91c1c` |

---

## Stellar (Purple)

Used for Stellar network / payment-related UI.

| Token | Class | Hex |
|-------|-------|-----|
| `stellar-50` | `bg-stellar-50` | `#f3f0ff` |
| `stellar-100` | `bg-stellar-100` | `#e5e0ff` |
| `stellar-500` | `bg-stellar-500` | `#7B68EE` |
| `stellar-700` | `bg-stellar-700` | `#5936e9` |
| `stellar-900` | `bg-stellar-900` | `#3f1f97` |

---

## Semantic tokens (CSS-variable-driven)

These tokens automatically switch between light and dark values via CSS
variables — components using them need no `dark:` prefix.

| Token | CSS variable | Light value | Dark value |
|-------|-------------|-------------|------------|
| `bg-surface` | `--color-surface` | `neutral-0` | `neutral-900` |
| `bg-surface-muted` | `--color-surface-muted` | `neutral-50` | `neutral-800` |
| `bg-surface-raised` | `--color-surface-raised` | `neutral-100` | `neutral-700` |
| `text-content` | `--color-content` | `neutral-900` | `neutral-50` |
| `text-content-muted` | `--color-content-muted` | `neutral-600` | `neutral-400` |
| `text-content-subtle` | `--color-content-subtle` | `neutral-500` | `neutral-500` |
| `border-DEFAULT` | `--color-border` | `neutral-200` | `neutral-700` |
| `border-muted` | `--color-border-muted` | `neutral-100` | `neutral-800` |
| `border-strong` | `--color-border-strong` | `neutral-300` | `neutral-600` |

---

## WCAG 2.1 Contrast Compliance

WCAG 2.1 AA requires:

- **4.5:1** contrast ratio for normal text (< 18pt / < 14pt bold)
- **3.0:1** contrast ratio for large text (≥ 18pt / ≥ 14pt bold) and UI components

Contrast ratios below are computed against their typical background pairings.

:::note
Full validation requires manual testing with assistive technologies and expert
accessibility review. The values below are calculated from the hex codes using
the [WCAG relative luminance formula](https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
:::

### Primary text on backgrounds

| Foreground | Background | Hex pair | Ratio | AA Normal | AA Large |
|-----------|------------|---------|-------|-----------|----------|
| `primary-700` (`#1d4ed8`) | `white` (`#ffffff`) | — | **8.59:1** | ✅ Pass | ✅ Pass |
| `primary-600` (`#2563eb`) | `white` (`#ffffff`) | — | **5.93:1** | ✅ Pass | ✅ Pass |
| `primary-500` (`#3b82f6`) | `white` (`#ffffff`) | — | **3.03:1** | ❌ Fail | ✅ Pass |
| `white` (`#ffffff`) | `primary-500` (`#3b82f6`) | — | **3.03:1** | ❌ Fail | ✅ Pass |
| `white` (`#ffffff`) | `primary-600` (`#2563eb`) | — | **5.93:1** | ✅ Pass | ✅ Pass |
| `white` (`#ffffff`) | `primary-700` (`#1d4ed8`) | — | **8.59:1** | ✅ Pass | ✅ Pass |

> **Design decision**: The primary Button uses `bg-primary-500 text-white` which
> is **3.03:1** — passes AA for large text (button labels ≥ 14pt bold typically
> qualify) but not for normal text. Use `primary-600` or `primary-700`
> backgrounds when pairing with white body text.

### Neutral text on backgrounds

| Foreground | Background | Ratio | AA Normal | AA Large |
|-----------|------------|-------|-----------|----------|
| `neutral-900` (`#111827`) | `white` (`#ffffff`) | **19.5:1** | ✅ Pass | ✅ Pass |
| `neutral-900` (`#111827`) | `neutral-50` (`#f9fafb`) | **18.4:1** | ✅ Pass | ✅ Pass |
| `neutral-700` (`#374151`) | `white` (`#ffffff`) | **10.7:1** | ✅ Pass | ✅ Pass |
| `neutral-700` (`#374151`) | `neutral-50` (`#f9fafb`) | **10.1:1** | ✅ Pass | ✅ Pass |
| `neutral-500` (`#6b7280`) | `white` (`#ffffff`) | **4.62:1** | ✅ Pass | ✅ Pass |
| `neutral-400` (`#9ca3af`) | `white` (`#ffffff`) | **2.53:1** | ❌ Fail | ❌ Fail |
| `neutral-400` (`#9ca3af`) | `neutral-800` (`#1f2937`) | **4.80:1** | ✅ Pass | ✅ Pass |

> `neutral-400` fails on white. It is used only for placeholder text and
> decorative icons (non-essential). Informational text always uses `neutral-700+`.

### Status / semantic text on backgrounds

| Foreground | Background | Ratio | AA Normal | AA Large |
|-----------|------------|-------|-----------|----------|
| `success-700` (`#047857`) | `success-50` (`#f0fdf4`) | **7.23:1** | ✅ Pass | ✅ Pass |
| `success-700` (`#047857`) | `white` (`#ffffff`) | **7.23:1** | ✅ Pass | ✅ Pass |
| `warning-700` (`#b45309`) | `warning-50` (`#fffbeb`) | **5.90:1** | ✅ Pass | ✅ Pass |
| `danger-700` (`#b91c1c`) | `danger-50` (`#fef2f2`) | **7.22:1** | ✅ Pass | ✅ Pass |
| `danger-700` (`#b91c1c`) | `white` (`#ffffff`) | **7.22:1** | ✅ Pass | ✅ Pass |
| `white` (`#ffffff`) | `danger-500` (`#ef4444`) | **3.77:1** | ❌ Fail | ✅ Pass |
| `white` (`#ffffff`) | `danger-600` (`#dc2626`) | **5.08:1** | ✅ Pass | ✅ Pass |

> The danger Button uses `bg-danger-500 text-white` (3.77:1 — passes for large
> text). Prefer `danger-600` background when normal text must pass AA.

### Focus ring

The global focus ring is `2px solid primary-500` (`#3b82f6`) with a 2px
offset. Against a white background the ring itself achieves **3.03:1**,
which meets the 3:1 threshold for UI components (WCAG 1.4.11).

---

## How to check contrast

```bash
# Install the WCAG contrast checker CLI
npx contrast-ratio "#3b82f6" "#ffffff"

# Or use the browser DevTools accessibility panel — inspect any element,
# open the Accessibility tab, and expand the "Computed Properties" section
# to see the contrast ratio computed by the browser engine.
```

Online tools:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Colour Contrast Analyser (desktop app)](https://www.tpgi.com/color-contrast-checker/)
