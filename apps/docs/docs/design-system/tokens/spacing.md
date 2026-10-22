---
title: Spacing & Layout
sidebar_label: Spacing & Layout
sidebar_position: 3
description: Spacing tokens, grid presets, z-index scale, and responsive container utilities from the Health Watchers design system.
---

# Spacing & Layout

## Spacing tokens

Named spacing tokens from `globals.css` map to semantic roles. They are
complemented by the extended Tailwind spacing scale.

### Named tokens (CSS custom properties)

| Token | Variable | Value | Tailwind equivalent |
|-------|---------|-------|---------------------|
| `xs` | `--spacing-xs` | `0.25rem` (4px) | `p-1` / `m-1` |
| `sm` | `--spacing-sm` | `0.5rem` (8px) | `p-2` / `m-2` |
| `md` | `--spacing-md` | `1rem` (16px) | `p-4` / `m-4` |
| `lg` | `--spacing-lg` | `1.5rem` (24px) | `p-6` / `m-6` |
| `xl` | `--spacing-xl` | `2rem` (32px) | `p-8` / `m-8` |
| `2xl` | `--spacing-2xl` | `3rem` (48px) | `p-12` / `m-12` |
| `3xl` | `--spacing-3xl` | `4rem` (64px) | `p-16` / `m-16` |

### Extended Tailwind spacing (non-standard additions)

| Class | Value | Use case |
|-------|-------|----------|
| `p-4.5` / `m-4.5` | `1.125rem` | Fine-tuned icon padding |
| `p-13` | `3.25rem` | Specific sidebar widths |
| `p-15` | `3.75rem` | — |
| `p-18` | `4.5rem` | — |
| `p-22` | `5.5rem` | — |
| `p-68` | `17rem` | Sidebar width |
| `p-76` | `19rem` | Slide-over panel |
| `p-84` | `21rem` | Wide panel |
| `p-128` | `32rem` | Max-width containers |

---

## Responsive spacing utilities

`apps/web/src/lib/design-system.ts` exports composable spacing classes:

| Constant | Classes | Usage |
|----------|---------|-------|
| `spacing.page` | `px-4 sm:px-6 lg:px-8` | Horizontal page padding |
| `spacing.section` | `py-8 sm:py-12 lg:py-16` | Vertical section spacing |
| `spacing.card` | `p-4 sm:p-6` | Card internal padding |
| `spacing.stack` | `space-y-4 sm:space-y-6` | Vertical stack gap |
| `spacing.inline` | `gap-2 sm:gap-4` | Inline element gap |
| `spacing.form` | `space-y-4` | Form field spacing |

```tsx
import { spacing } from '@/lib/design-system';

<section className={spacing.section}>
  <div className={spacing.page}>…</div>
</section>
```

---

## Border radius

| Token | Variable | Value | Class |
|-------|---------|-------|-------|
| `sm` | `--radius-sm` | `0.125rem` | `rounded-sm` |
| `md` | `--radius-md` | `0.375rem` | `rounded-md` |
| `lg` | `--radius-lg` | `0.5rem` | `rounded-lg` |
| `xl` | `--radius-xl` | `0.75rem` | `rounded-xl` |
| `2xl` | `--radius-2xl` | `1rem` | `rounded-2xl` |
| `full` | `--radius-full` | `9999px` | `rounded-full` |

Most components use `rounded-lg` for cards/panels and `rounded-md` for inputs
and buttons.

---

## Shadows

| Token | Variable | Tailwind class |
|-------|---------|----------------|
| `sm` | `--shadow-sm` | `shadow-sm` |
| `md` | `--shadow-md` | `shadow-md` |
| `lg` | `--shadow-lg` | `shadow-lg` |
| `xl` | `--shadow-xl` | `shadow-xl` |

---

## Breakpoints

| Name | Min width | Common use |
|------|-----------|------------|
| `xs` | `480px` | Fine-grained mobile adjustments |
| `sm` | `640px` | Two-column layouts begin |
| `md` | `768px` | Tablet breakpoint |
| `lg` | `1024px` | Desktop navigation appears |
| `xl` | `1280px` | Wide dashboard layouts |
| `2xl` | `1536px` | Max-width containers |

The `xs` breakpoint is a **custom addition** — standard Tailwind does not
include it. Always start styles at the base (mobile) and add responsive
modifiers upward.

---

## Grid presets

| Constant | Classes | Description |
|----------|---------|-------------|
| `grids.cols2` | `grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6` | Two-column responsive |
| `grids.cols3` | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6` | Three-column |
| `grids.cols4` | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` | Four-column |
| `grids.dashboard` | `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6` | Dashboard stat cards |
| `grids.sidebar` | `grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6` | Sidebar + content |
| `grids.autoFit` | `grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 sm:gap-6` | Auto-fit cards |

---

## Container presets

| Constant | Max width | Usage |
|----------|-----------|-------|
| `containers.page` | `max-w-7xl` | Standard page content |
| `containers.narrow` | `max-w-3xl` | Forms, articles |
| `containers.wide` | `max-w-screen-2xl` | Wide dashboards |
| `containers.card` | — | Card shell with border/shadow |
| `containers.full` | Full width | Edge-to-edge with padding |

Or use the `<ResponsiveContainer>` component:

```tsx
import { ResponsiveContainer } from '@/components/ui';

<ResponsiveContainer variant="narrow">
  <PatientForm />
</ResponsiveContainer>
```

---

## Z-index scale

| Constant | Class | Description |
|----------|-------|-------------|
| `zIndex.base` | `z-0` | Default stacking context |
| `zIndex.raised` | `z-10` | Cards, sticky elements |
| `zIndex.dropdown` | `z-20` | Dropdown menus |
| `zIndex.sticky` | `z-30` | Sticky nav bar |
| `zIndex.overlay` | `z-40` | Modal backdrop |
| `zIndex.modal` | `z-50` | Modal panel |
| `zIndex.popover` | `z-[55]` | Popovers over modals |
| `zIndex.toast` | `z-[60]` | Toast notifications |
| `zIndex.tooltip` | `z-[70]` | Tooltips (highest) |

Always use these named constants instead of ad-hoc z-index values to keep the
stacking order predictable.

---

## Interactive touch targets (WCAG 2.5.5)

WCAG 2.5.5 requires minimum 44×44 CSS-px touch targets for pointer-activated
controls. All interactive components meet this by default:

| Constant | Classes | Applied to |
|----------|---------|------------|
| `interactive.minTouchTarget` | `min-h-[44px] min-w-[44px]` | Any custom clickable |
| `interactive.button` | `min-h-[44px] px-4 py-2` | Custom button wrappers |
| `interactive.buttonSm` | `min-h-[36px] px-3 py-1.5 text-sm` | Small buttons (exception: toolbars) |
| `interactive.input` | `min-h-[44px] px-3 py-2 w-full` | Form inputs |
| `interactive.iconButton` | `h-11 w-11` | Icon-only buttons |
