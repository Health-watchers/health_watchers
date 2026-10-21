---
title: Modal
sidebar_label: Modal
sidebar_position: 3
description: Accessible modal dialog with focus trap, Escape-to-close, body scroll lock, and ARIA pattern.
---

# Modal

`apps/web/src/components/ui/Modal.tsx`

An accessible modal dialog. It implements the
[ARIA dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
with a full focus trap, Escape-to-close, body scroll lock, and automatic focus
restoration.

---

## Import

```tsx
import { Modal } from '@/components/ui';
```

---

## Basic usage

```tsx
const [open, setOpen] = useState(false);

<Button onClick={() => setOpen(true)}>Open modal</Button>

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Confirm appointment"
  description="Review the appointment details before saving."
>
  <p>Patient: Jane Doe — Thursday 14:00</p>
  <div className="mt-4 flex justify-end gap-2">
    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
    <Button onClick={() => setOpen(false)}>Confirm</Button>
  </div>
</Modal>
```

---

## Sizes

| Size | Max width | Use case |
|------|-----------|----------|
| `sm` | `max-w-sm` (384px) | Confirmation prompts, simple alerts |
| `md` *(default)* | `max-w-lg` (512px) | Standard forms, detail panels |
| `lg` | `max-w-2xl` (672px) | Complex forms, multi-step flows |

```tsx
<Modal open={open} onClose={close} size="sm" title="Delete record">
  Are you sure? This cannot be undone.
</Modal>

<Modal open={open} onClose={close} size="lg" title="New encounter">
  <EncounterForm />
</Modal>
```

---

## With description

The `description` prop renders a subtitle below the title and is wired to
`aria-describedby` automatically:

```tsx
<Modal
  open={open}
  onClose={close}
  title="Export patient data"
  description="This will generate a HIPAA-compliant PDF export."
>
  …
</Modal>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `open` | `boolean` | — | Controls visibility |
| `onClose` | `() => void` | — | Called on Escape, backdrop click, or close button |
| `title` | `string` | — | Modal heading (`aria-labelledby`) |
| `description` | `string` | — | Subtitle text (`aria-describedby`) |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Max width of the panel |
| `className` | `string` | — | Extra classes on the panel element |
| `children` | `ReactNode` | — | Modal body content |

---

## Keyboard interaction

| Key | Action |
|-----|--------|
| `Escape` | Closes the modal and restores focus to the trigger element |
| `Tab` | Cycles forward through focusable elements within the modal |
| `Shift + Tab` | Cycles backward through focusable elements within the modal |

Focus is trapped within the modal panel for the entire duration it is open.
When closed, focus is returned to `document.activeElement` at the time the
modal was opened (typically the trigger button).

---

## ARIA pattern

```html
<!-- Rendered HTML -->
<div aria-hidden="true" class="fixed inset-0 z-40 bg-black/40" />
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-description"
  tabindex="-1"
  class="fixed left-1/2 top-1/2 z-50 …"
>
  <h2 id="modal-title">Confirm appointment</h2>
  <p id="modal-description">Review the appointment details before saving.</p>
  <!-- children -->
  <button aria-label="Close">✕</button>
</div>
```

- `role="dialog"` + `aria-modal="true"` tells assistive technologies that the
  rest of the page is inert.
- `tabIndex={-1}` on the panel allows it to receive programmatic focus on open.
- The backdrop has `aria-hidden="true"` so it is invisible to screen readers.

---

## ConfirmDialog — destructive variant

For destructive actions, use `ConfirmDialog` which extends Modal with:

- A red **Confirm** button (`bg-danger-500`)
- An optional `requireTextMatch` prop that forces the user to type a specific
  string before the confirm button is enabled (guards permanent deletes)
- A `loading` state with inline spinner on the confirm button

```tsx
import { ConfirmDialog } from '@/components/ui';

<ConfirmDialog
  open={open}
  onClose={() => setOpen(false)}
  onConfirm={handleDelete}
  title="Delete patient record"
  description="This action cannot be undone."
  confirmLabel="Delete"
  requireTextMatch="Jane Doe"
/>
```

---

## Dialog (extended) — stacked dialogs

For use cases where multiple dialogs can be open simultaneously, use the
`Dialog` component from `Dialog.tsx`. It adds a `DialogStackProvider` context
that tracks open dialogs and ensures only the topmost dialog responds to Escape.

```tsx
import { Dialog } from '@/components/ui/Dialog';
// NOT exported from index.ts — import directly when needed
```
