---
title: Button
sidebar_label: Button
sidebar_position: 1
description: All Button variants, sizes, and states with usage examples and accessibility notes.
---

# Button

`apps/web/src/components/ui/Button.tsx`

The `Button` component is built with [`class-variance-authority`](https://cva.style)
for variant management and `React.forwardRef` for ref forwarding.

---

## Import

```tsx
import { Button } from '@/components/ui';
```

---

## Variants

Five variants cover the full range of interactive actions:

| Variant | Background | Text | Use case |
|---------|-----------|------|----------|
| `primary` | `primary-500` | white | Primary CTA, form submit |
| `secondary` | `neutral-100` | `neutral-800` | Secondary actions |
| `ghost` | transparent | `neutral-700` | Tertiary / icon-adjacent |
| `danger` | `danger-500` | white | Destructive actions (delete, void) |
| `outline` | white | `neutral-700` | Bordered, lower-emphasis actions |

```tsx
<Button variant="primary">Save changes</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">View details</Button>
<Button variant="danger">Delete patient</Button>
<Button variant="outline">Export CSV</Button>
```

---

## Sizes

| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | `h-8` (32px) | `px-3` | `text-xs` |
| `md` *(default)* | `h-10` (40px) | `px-4` | `text-sm` |
| `lg` | `h-12` (48px) | `px-6` | `text-base` |

```tsx
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

---

## Loading state

Pass `loading={true}` to disable the button and show an inline `Spinner`.
The button also sets `aria-busy="true"` so screen readers announce the loading state.

```tsx
const [saving, setSaving] = useState(false);

<Button
  loading={saving}
  onClick={async () => {
    setSaving(true);
    await savePatient();
    setSaving(false);
  }}
>
  Save
</Button>
```

---

## Disabled state

Use the native `disabled` prop. Disabled buttons receive
`pointer-events-none opacity-50` automatically.

```tsx
<Button disabled>Not available</Button>
```

---

## Variant × size matrix

| | `sm` | `md` | `lg` |
|-|------|------|------|
| `primary` | ✅ | ✅ | ✅ |
| `secondary` | ✅ | ✅ | ✅ |
| `ghost` | ✅ | ✅ | ✅ |
| `danger` | ✅ | ✅ | ✅ |
| `outline` | ✅ | ✅ | ✅ |

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'outline'` | `'primary'` | Visual variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Height + padding |
| `loading` | `boolean` | `false` | Shows spinner, sets `aria-busy`, disables click |
| `disabled` | `boolean` | `false` | Native HTML disabled |
| `className` | `string` | — | Additional Tailwind classes |
| `asChild` | `boolean` | — | Kept for API compatibility, not functional |
| `...rest` | `ButtonHTMLAttributes` | — | All standard button attributes |

---

## Dark mode

Every variant ships with `dark:` variants. Dark mode is activated by the
`dark` class on `<html>` — no extra work needed in consuming components.

| Variant | Dark background | Dark text |
|---------|----------------|-----------|
| `primary` | `primary-600` (hover: 700, active: 800) | white |
| `secondary` | `neutral-800` (hover: 700) | `neutral-100` |
| `ghost` | transparent (hover: `neutral-800`) | `neutral-300` |
| `danger` | `danger-600` (hover: 700) | white |
| `outline` | `neutral-900` (hover: 800) | `neutral-300`, border `neutral-600` |

---

## Accessibility

- **Focus ring**: `focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2`
  — visible for keyboard users, suppressed for mouse users via `:focus:not(:focus-visible)`.
- **`aria-busy`**: set to `true` during `loading` state so assistive technologies
  announce that an action is in progress.
- **Disabled**: native `disabled` attribute prevents focus and interaction; do
  not use `aria-disabled` as a substitute unless the button must remain focusable.
- **Touch target**: `md` and `lg` sizes meet WCAG 2.5.5's 44×44px minimum.
  `sm` (32px) is intentionally below the minimum — only use it in constrained
  toolbar contexts where the WCAG 2.5.5 exception applies.
- **Contrast**: use `primary-600` (5.93:1 on white) instead of `primary-500`
  (3.03:1) when the button label must pass AA for normal text.

---

## Source

```tsx title="apps/web/src/components/ui/Button.tsx"
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:   'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 …',
        secondary: 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 …',
        ghost:     'bg-transparent text-neutral-700 hover:bg-neutral-100 …',
        danger:    'bg-danger-500 text-white hover:bg-danger-600 …',
        outline:   'border border-neutral-300 bg-white text-neutral-700 …',
      },
      size: {
        sm: 'h-8  px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);
```
