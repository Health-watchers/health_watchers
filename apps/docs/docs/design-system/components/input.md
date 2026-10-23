---
title: Input
sidebar_label: Input
sidebar_position: 2
description: Text input component with label, error, helper text, icon slots, and full ARIA support.
---

# Input

`apps/web/src/components/ui/Input.tsx`

A full-featured form field component. It composes a `<label>`, the `<input>`,
an optional helper message, and an error message — all wired up with the correct
ARIA relationships automatically.

---

## Import

```tsx
import { Input } from '@/components/ui';
```

---

## Basic usage

```tsx
<Input
  label="Email address"
  type="email"
  placeholder="doctor@example.com"
/>
```

---

## States

### Default

```tsx
<Input label="Patient name" placeholder="Search…" />
```

### With helper text

```tsx
<Input
  label="Phone number"
  helperText="Include country code, e.g. +1 555 000 0000"
/>
```

### With error

```tsx
<Input
  label="Date of birth"
  error="Date must be in the past"
  value="2099-01-01"
  readOnly
/>
```

Error state:
- Border turns `border-danger-500`
- Error message appears below in `text-danger-500 text-xs`
- `aria-invalid="true"` is set on the `<input>`
- `aria-describedby` points to the error message element

### Required field

```tsx
<Input label="Chief complaint" required />
```

A visible `*` (red, `text-danger-600`) and a screen-reader-only " required"
text are added to the label automatically.

### Disabled

```tsx
<Input label="System ID" disabled value="HW-001234" />
```

`cursor-not-allowed opacity-50` is applied.

---

## Icon slots

Use `leftIcon` and `rightIcon` for decorative or functional icons.
They are positioned absolutely inside the input so the input padding
adjusts automatically (`pl-9` / `pr-9`).

```tsx
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

// Left icon — search
<Input
  label="Search patients"
  leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
  placeholder="Name or ID…"
/>

// Right icon — decorative status indicator
<Input
  label="Email"
  rightIcon={<CheckIcon className="h-4 w-4 text-success-500" />}
/>
```

:::caution
Icons are wrapped in `pointer-events-none` when used as left icons. If the
right icon needs to be clickable (e.g., a clear button), use
[`SearchInput`](./search-input) instead, which has a built-in clear button
with the correct `aria-label`.
:::

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Visible label text (also used to auto-generate `id`) |
| `helperText` | `string` | — | Informational text below the input |
| `error` | `string` | — | Error message; also triggers error styling |
| `errorRole` | `string` | `'alert'` | ARIA role for the error element |
| `leftIcon` | `ReactNode` | — | Icon rendered left of the input text |
| `rightIcon` | `ReactNode` | — | Icon rendered right of the input text |
| `required` | `boolean` | `false` | Shows visual `*` and sr-only "required" |
| `id` | `string` | auto | Overrides the auto-generated `id` |
| `className` | `string` | — | Extra classes applied to the `<input>` element |
| `...rest` | `InputHTMLAttributes` | — | All standard input attributes |

---

## ARIA pattern

The component follows the
[ARIA Authoring Practices Guide — Text Input](https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/)
pattern:

```html
<!-- Rendered output when label="Email" and error="Invalid email" -->
<div>
  <label for="email">
    Email
    <span aria-hidden="true" class="text-danger-600">*</span>
    <span class="sr-only"> required</span>
  </label>
  <input
    id="email"
    aria-invalid="true"
    aria-describedby="email-error"
    required
  />
  <p id="email-error" role="alert" class="text-danger-500 text-xs">
    Invalid email
  </p>
</div>
```

---

## Related components

| Component | When to use |
|-----------|------------|
| [`Textarea`](./textarea) | Multi-line text input |
| [`SearchInput`](./search-input) | Search with built-in clear button |
| [`PasswordInput`](./password-input) | Password with show/hide toggle |
| [`Select`](./select) | Dropdown selection |
| [`OtpInput`](./otp-input) | One-time password / 6-digit code |
