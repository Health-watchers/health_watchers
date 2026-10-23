---
title: Typography
sidebar_label: Typography
sidebar_position: 2
description: Font family, type scale, responsive typography levels, and utility classes from the Health Watchers design system.
---

# Typography

The design system uses [Inter](https://rsms.me/inter/) as the sole typeface,
loaded via the font token and applied globally.

```css
/* globals.css */
--font-family-sans: Inter, system-ui, -apple-system, sans-serif;
```

```ts
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
}
```

---

## Font size scale

These tokens are available as both CSS custom properties and Tailwind classes.

| Token | CSS variable | Tailwind class | Size | Line height |
|-------|-------------|----------------|------|-------------|
| `2xs` | `—` | `text-2xs` | `0.625rem` (10px) | `0.875rem` |
| `xs` | `--font-size-xs` | `text-xs` | `0.75rem` (12px) | `1rem` |
| `sm` | `--font-size-sm` | `text-sm` | `0.875rem` (14px) | `1.25rem` |
| `base` | `--font-size-base` | `text-base` | `1rem` (16px) | `1.5rem` |
| `lg` | `--font-size-lg` | `text-lg` | `1.125rem` (18px) | `1.75rem` |
| `xl` | `--font-size-xl` | `text-xl` | `1.25rem` (20px) | `1.75rem` |
| `2xl` | `--font-size-2xl` | `text-2xl` | `1.5rem` (24px) | `2rem` |
| `3xl` | `--font-size-3xl` | `text-3xl` | `1.875rem` (30px) | `2.25rem` |
| `4xl` | `--font-size-4xl` | `text-4xl` | `2.25rem` (36px) | `2.5rem` |
| `5xl` | `—` | `text-5xl` | `3rem` (48px) | `1.1` |
| `6xl` | `—` | `text-6xl` | `3.75rem` (60px) | `1.1` |

---

## Semantic levels

`apps/web/src/lib/design-system.ts` exports a `typography` object with
pre-composed, mobile-first responsive Tailwind classes for each semantic level.
Use `textScale(level)` to get the full composed string.

```ts
import { textScale } from '@/lib/design-system';
// e.g. textScale('h1') → 'text-xl font-bold leading-tight sm:text-2xl lg:text-3xl'
```

| Level | Base classes | Responsive modifiers |
|-------|-------------|----------------------|
| `display` | `text-2xl font-bold leading-tight tracking-tight` | `sm:text-3xl lg:text-4xl xl:text-5xl` |
| `h1` | `text-xl font-bold leading-tight` | `sm:text-2xl lg:text-3xl` |
| `h2` | `text-lg font-semibold leading-snug` | `sm:text-xl lg:text-2xl` |
| `h3` | `text-base font-semibold leading-snug` | `sm:text-lg` |
| `h4` | `text-sm font-semibold` | `sm:text-base` |
| `body` | `text-sm leading-relaxed` | `sm:text-base` |
| `bodyLg` | `text-base leading-relaxed sm:text-lg` | — |
| `small` | `text-xs leading-relaxed` | — |
| `label` | `text-xs font-medium uppercase tracking-wide` | — |
| `caption` | `text-xs text-muted-foreground` | — |
| `code` | `font-mono text-sm` | — |

### Usage example

```tsx
import { textScale } from '@/lib/design-system';

<h1 className={textScale('h1')}>Patient Overview</h1>
<p className={textScale('body')}>Last updated 2 minutes ago</p>
<span className={textScale('label')}>Status</span>
```

---

## PageHeader component

The `PageHeader` component from `apps/web/src/components/ui/PageWrapper.tsx`
uses the semantic scale internally:

```tsx
import { PageHeader } from '@/components/ui';

<PageHeader
  title="Patients"
  subtitle="Manage and search your patient records"
  actions={<Button>New patient</Button>}
/>
```

Renders:
- `<h1>` — `text-2xl sm:text-3xl font-bold`
- Subtitle — `text-sm text-neutral-500`

---

## Accessibility — typography

- **Minimum body text size**: `text-sm` (14px). Avoid `text-xs` for
  multi-sentence body copy.
- **Line height**: use `leading-relaxed` (1.625) for paragraph text.
- **Letter spacing**: `tracking-wide` / `tracking-tight` only for display/label
  roles — never apply tracking to body text (reduces readability for dyslexic users).
- **Font weight**: bold labels should have sufficient contrast even at smaller
  sizes (14pt bold qualifies as "large text" under WCAG 2.1).
- **Underlines on links**: always underline `<a>` elements in body copy — avoid
  conveying link state through color alone (WCAG 1.4.1).
