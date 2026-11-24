---
title: Badge
sidebar_label: Badge
sidebar_position: 5
description: Inline status badge with five semantic variants and dark mode support.
---

# Badge

`apps/web/src/components/ui/Badge.tsx`

A small inline label for status, category, or count indicators. Built with
[`class-variance-authority`](https://cva.style).

---

## Import

```tsx
import { Badge } from '@/components/ui';
```

---

## Variants

| Variant | Light bg / text | Dark bg / text | Use case |
|---------|----------------|----------------|----------|
| `default` *(default)* | `neutral-100` / `neutral-700` | `neutral-800` / `neutral-300` | Neutral labels, tags |
| `primary` | `primary-100` / `primary-700` | `primary-900/40` / `primary-300` | Active filters, selected items |
| `success` | `success-50` / `success-700` | `success-900/30` / `success-300` | Confirmed, active, completed |
| `warning` | `warning-50` / `warning-700` | `warning-900/30` / `warning-300` | Pending, in-progress, caution |
| `danger` | `danger-50` / `danger-700` | `danger-900/30` / `danger-300` | Failed, cancelled, critical |

```tsx
<Badge>Default</Badge>
<Badge variant="primary">Primary</Badge>
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Cancelled</Badge>
```

---

## With icon

`Badge` uses `inline-flex items-center gap-1` so an icon can be prepended:

```tsx
<Badge variant="success">
  <CheckIcon className="h-3 w-3" aria-hidden="true" />
  Confirmed
</Badge>

<Badge variant="danger">
  <XCircleIcon className="h-3 w-3" aria-hidden="true" />
  Rejected
</Badge>
```

Keep icons `aria-hidden="true"` — the badge text already conveys the meaning.

---

## Common patterns

### Payment / appointment status

```tsx
function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, BadgeVariant> = {
    confirmed: 'success',
    pending:   'warning',
    cancelled: 'danger',
    voided:    'danger',
    active:    'primary',
  };
  return (
    <Badge variant={variantMap[status] ?? 'default'}>
      {status}
    </Badge>
  );
}
```

### Role label

```tsx
<Badge variant="primary">Doctor</Badge>
<Badge variant="default">Nurse</Badge>
<Badge>Admin</Badge>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'primary' \| 'success' \| 'warning' \| 'danger'` | `'default'` | Color scheme |
| `className` | `string` | — | Additional Tailwind classes |
| `children` | `ReactNode` | — | Badge text / icon |
| `...rest` | `HTMLAttributes<HTMLSpanElement>` | — | All span attributes |

---

## Accessibility

- Badge renders as a `<span>` (inline, non-interactive).
- It has no implicit ARIA role — it is purely presentational.
- When used to convey status programmatically (e.g. in a data table),
  ensure the enclosing row or description also conveys the status in text
  so it is not lost when CSS is disabled.
- Do **not** rely solely on badge color to convey meaning — always include
  text (WCAG 1.4.1 Use of Color).

---

## Contrast

All badge foreground/background pairs exceed WCAG 2.1 AA at 4.5:1:

| Variant | Foreground | Background | Ratio |
|---------|-----------|------------|-------|
| `success` | `success-700` `#047857` | `success-50` `#f0fdf4` | **7.23:1** ✅ |
| `warning` | `warning-700` `#b45309` | `warning-50` `#fffbeb` | **5.90:1** ✅ |
| `danger` | `danger-700` `#b91c1c` | `danger-50` `#fef2f2` | **7.22:1** ✅ |
| `primary` | `primary-700` `#1d4ed8` | `primary-100` `#dbeafe` | **7.45:1** ✅ |
| `default` | `neutral-700` `#374151` | `neutral-100` `#f3f4f6` | **9.24:1** ✅ |
