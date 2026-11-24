---
title: Toast
sidebar_label: Toast
sidebar_position: 4
description: Toast notifications — controlled component, imperative API, and ARIA live region pattern.
---

# Toast

`apps/web/src/components/ui/Toast.tsx`

Two usage modes:

1. **Controlled `<Toast>`** — caller manages open/close state (useful for one-off
   notifications tied to local component state)
2. **Imperative `toast.*`** — fire-and-forget calls from anywhere in the app
   (the `<Toaster />` component renders all queued toasts)

---

## Import

```tsx
import { Toast, Toaster, toast } from '@/components/ui';
```

---

## Toaster setup

Mount `<Toaster />` **once** in the root layout. It renders a fixed bottom-right
container and manages the toast queue automatically.

```tsx title="apps/web/src/app/layout.tsx"
import { Toaster } from '@/components/ui';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

---

## Imperative API (recommended)

The `toast` object exposes three methods:

```tsx
// Success — green, polite announcement
toast.success('Patient record saved.');

// Error — red, assertive announcement (interrupts screen readers)
toast.error('Failed to save. Please try again.');

// Info — blue, polite announcement
toast.info('Appointment reminder sent to patient.');
```

Toasts auto-dismiss after **4500 ms**. Each toast has a dismiss button.

---

## Controlled `<Toast>` component

Use when the notification is tied to a piece of component state:

```tsx
const [show, setShow] = useState(false);

<Button onClick={() => setShow(true)}>Save</Button>

{show && (
  <Toast
    message="Record updated successfully."
    type="success"
    duration={3000}
    onClose={() => setShow(false)}
  />
)}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `message` | `string` | — | Notification text |
| `type` | `'success' \| 'error' \| 'info'` | `'info'` | Visual variant |
| `onClose` | `() => void` | — | Called after `duration` ms or on dismiss click |
| `duration` | `number` | `4000` | Auto-dismiss delay in milliseconds |

---

## Variants

| Variant | Background (light) | Background (dark) | Text | Icon |
|---------|-------------------|-------------------|------|------|
| `success` | `bg-green-50 border-green-600` | `bg-green-900/30 border-green-700` | `text-green-800` | ✓ |
| `error` | `bg-red-50 border-red-500` | `bg-red-900/30 border-red-700` | `text-red-800` | ✕ |
| `info` | `bg-blue-50 border-blue-500` | `bg-blue-900/30 border-blue-700` | `text-blue-800` | ℹ |

---

## ARIA live regions

Screen readers are notified via live region semantics:

| Variant | ARIA role | Announcement |
|---------|-----------|--------------|
| `success` | `role="status"` | Polite — waits for a pause in speech |
| `info` | `role="status"` | Polite |
| `error` | `role="alert"` | Assertive — interrupts current speech |

The `<Toaster>` container itself is `role="region" aria-label="Notifications"`,
but each individual item carries its own live region role so the browser
announces them exactly once.

```html
<!-- Rendered HTML for a success toast -->
<div role="region" aria-label="Notifications" class="fixed bottom-4 right-4 …">
  <div role="status" aria-atomic="true" class="…">
    <span aria-hidden="true">✓</span>
    <span class="sr-only">Success:</span>
    <p>Patient record saved.</p>
    <button aria-label="Dismiss notification">×</button>
  </div>
</div>
```

The icon glyph is `aria-hidden="true"` and the variant label ("Success:",
"Error:", "Info:") is provided as screen-reader-only text so the full message
reads naturally: *"Success: Patient record saved."*

---

## Positioning

Both the controlled `<Toast>` and `<Toaster>` use `fixed bottom-4 right-4 z-[60]`
(z-index 60 — above modals and overlays; see [Spacing & Layout](../tokens/spacing#z-index-scale)).

If your UI needs top-positioned toasts, set a custom `className` on the
controlled `<Toast>` component.
