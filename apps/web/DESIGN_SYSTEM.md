# Health Watchers — Design System

All tokens are defined in `src/app/globals.css` under `@theme` and are available
as Tailwind utility classes (e.g. `bg-primary-500`, `text-neutral-700`).

---

## Color Palette

### Primary — Trust / Action
| Token | Value | Use |
|---|---|---|
| `primary-50` | `#eff6ff` | Hover backgrounds, active nav bg |
| `primary-100` | `#dbeafe` | Subtle tints |
| `primary-500` | `#0F6FEC` | Buttons, links, active states, focus rings |
| `primary-600` | `#0d5fcc` | Button hover |
| `primary-700` | `#0a4fac` | Button active / pressed |

### Success — Positive outcomes
| Token | Value | Use |
|---|---|---|
| `success-50` | `#f0fdf4` | Success alert background |
| `success-500` | `#16A34A` | Success badges, confirmed status |
| `success-700` | `#166534` | Success text on light bg |

### Warning — Caution
| Token | Value | Use |
|---|---|---|
| `warning-50` | `#fffbeb` | Warning alert background |
| `warning-500` | `#D97706` | Warning badges, pending status |
| `warning-700` | `#92400e` | Warning text on light bg |

### Danger — Errors / Urgent
| Token | Value | Use |
|---|---|---|
| `danger-50` | `#fef2f2` | Error alert background |
| `danger-500` | `#DC2626` | Error messages, destructive actions, urgent triage |
| `danger-700` | `#991b1b` | Error text on light bg |

### Neutral — Structure / Text
| Token | Value | Use |
|---|---|---|
| `neutral-0` | `#ffffff` | Card / panel backgrounds |
| `neutral-50` | `#f9fafb` | Page background |
| `neutral-100` | `#f3f4f6` | Hover states, dividers |
| `neutral-200` | `#e5e7eb` | Borders |
| `neutral-300` | `#d1d5db` | Disabled borders |
| `neutral-400` | `#9ca3af` | Placeholder text |
| `neutral-500` | `#6b7280` | Secondary / muted text |
| `neutral-600` | `#4b5563` | Body text |
| `neutral-700` | `#374151` | Subheadings |
| `neutral-800` | `#1f2937` | Headings |
| `neutral-900` | `#111827` | Primary text |

---

## Typography

Font: **Inter** (loaded via `next/font/google`)

### Scale
| Token | Size | Use |
|---|---|---|
| `text-xs` | 12px | Labels, captions, badges |
| `text-sm` | 14px | Body small, table cells, nav items |
| `text-base` | 16px | Default body text |
| `text-lg` | 18px | Card titles, section labels |
| `text-xl` | 20px | Page sub-headings (h3) |
| `text-2xl` | 24px | Page headings (h2) |
| `text-3xl` | 30px | Hero / dashboard headings (h1) |

### Weights
| Token | Value | Use |
|---|---|---|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Labels, nav items, subheadings |
| `font-semibold` | 600 | Headings, card titles |
| `font-bold` | 700 | Hero headings, emphasis |

---

## Spacing

Base unit: **4px (0.25rem)**

| Token | Value | Use |
|---|---|---|
| `spacing-1` | 4px | Icon gaps, tight padding |
| `spacing-2` | 8px | Inline padding, small gaps |
| `spacing-3` | 12px | Input padding, compact cards |
| `spacing-4` | 16px | Standard padding |
| `spacing-5` | 20px | Section gaps |
| `spacing-6` | 24px | Card padding |
| `spacing-8` | 32px | Section spacing |
| `spacing-10` | 40px | Large section gaps |
| `spacing-12` | 48px | Page section padding |
| `spacing-16` | 64px | Hero spacing |

---

## Border Radius

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | Badges, tags |
| `rounded-md` | 8px | Buttons, inputs, cards |
| `rounded-lg` | 12px | Modals, large cards |
| `rounded-full` | 9999px | Avatars, pill badges |

---

## Shadows

| Token | Use |
|---|---|
| `shadow-sm` | Subtle card lift |
| `shadow-md` | Dropdowns, popovers |
| `shadow-lg` | Modals, drawers |

---

## Layout Constants

| Token | Value | Use |
|---|---|---|
| `--sidebar-width` | 240px | Left sidebar width |
| `--topbar-height` | 56px | Top header height |
