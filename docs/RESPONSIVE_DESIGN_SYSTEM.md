# Responsive Design System

> Issue #1221 — Frontend: Responsive Design System Refactor

This document describes the responsive design patterns used across Health Watchers. All UI work **must** follow these guidelines to ensure consistency on mobile, tablet, and desktop.

---

## Breakpoints

All styles are **mobile-first**: the base styles target the smallest screen, and larger breakpoints override them.

| Name | Min Width | Typical Device         |
|------|-----------|------------------------|
| (base) | 0px     | Mobile phones (portrait) |
| `xs`   | 480px   | Large phones, small phones landscape |
| `sm`   | 640px   | Small tablets, phones landscape |
| `md`   | 768px   | Tablets                |
| `lg`   | 1024px  | Tablets landscape, small laptops |
| `xl`   | 1280px  | Laptops, desktops      |
| `2xl`  | 1536px  | Large desktops         |

```ts
// tailwind.config.ts — the xs breakpoint is a custom addition (issue #1221)
screens: {
  xs: '480px',
  // sm/md/lg/xl/2xl are Tailwind defaults
}
```

---

## Design Tokens

Import from `apps/web/src/lib/design-system.ts`:

```ts
import {
  breakpoints,
  typography,
  textScale,
  spacing,
  containers,
  grids,
  flex,
  interactive,
  images,
  zIndex,
  focusRing,
} from '@/lib/design-system';
```

---

## Responsive Components

### `<ResponsiveContainer>`

Wraps page content with consistent max-width and responsive horizontal padding.

```tsx
import { ResponsiveContainer } from '@/components/ui';

// Standard page (max-w-7xl)
<ResponsiveContainer>
  <PageContent />
</ResponsiveContainer>

// Narrow (max-w-3xl) — login, settings forms
<ResponsiveContainer variant="narrow">
  <LoginForm />
</ResponsiveContainer>

// Wide (max-w-screen-2xl)
<ResponsiveContainer variant="wide">
  <DataTable />
</ResponsiveContainer>

// As a semantic element
<ResponsiveContainer as="main">
  <Content />
</ResponsiveContainer>
```

**Variants:** `page` (default) | `narrow` | `wide` | `full` | `card`

---

### `<ResponsiveGrid>`

Mobile-first grid with named column presets.

```tsx
import { ResponsiveGrid } from '@/components/ui';

// 1 col → 3 cols
<ResponsiveGrid cols="cols3">
  <PatientCard />
  <PatientCard />
  <PatientCard />
</ResponsiveGrid>

// Dashboard cards: 1 → 2 → 3
<ResponsiveGrid cols="dashboard">
  <MetricCard />
  <MetricCard />
</ResponsiveGrid>

// Sidebar layout: full → [280px, 1fr]
<ResponsiveGrid cols="sidebar">
  <Sidebar />
  <Main />
</ResponsiveGrid>
```

**Presets:**

| Preset | Mobile | sm | lg |
|--------|--------|----|----|
| `cols2` | 1 | 2 | 2 |
| `cols3` | 1 | 2 | 3 |
| `cols4` | 1 | 2 | 4 |
| `dashboard` | 1 | 2 (md) | 3 (xl) |
| `sidebar` | 1 | 1 | [280px, 1fr] |
| `autoFit` | auto-fill ≥280px | — | — |

---

### `<ResponsiveStack>`

Flexible layout primitive replacing ad-hoc flex utilities.

```tsx
import { ResponsiveStack } from '@/components/ui';

// Default: vertical stack with md gap
<ResponsiveStack>
  <Field />
  <Field />
</ResponsiveStack>

// Column on mobile → row on sm, items centered, space between
<ResponsiveStack direction="responsive" align="center" justify="between" gap="md">
  <PageTitle />
  <ActionButtons />
</ResponsiveStack>

// Horizontal wrapping chip list
<ResponsiveStack direction="horizontal" gap="sm">
  <Chip />
  <Chip />
</ResponsiveStack>
```

**Props:**

| Prop | Options | Default |
|------|---------|---------|
| `direction` | `vertical` \| `horizontal` \| `responsive` \| `responsive-reverse` | `vertical` |
| `gap` | `xs` \| `sm` \| `md` \| `lg` \| `xl` | `md` |
| `align` | `start` \| `center` \| `end` \| `stretch` \| `baseline` | — |
| `justify` | `start` \| `center` \| `end` \| `between` \| `around` \| `evenly` | — |
| `as` | any HTML element | `div` |

---

## Typography Scale

Use `textScale()` to get the full responsive class string:

```ts
import { textScale } from '@/lib/design-system';

// Returns: "text-xl font-bold leading-tight sm:text-2xl lg:text-3xl"
const headingClass = textScale('h1');
```

Or reference individual breakpoint classes:

```tsx
<h1 className={`${typography.h1.base} ${typography.h1.sm} ${typography.h1.lg}`}>
  Patient Dashboard
</h1>
```

---

## Spacing

```tsx
import { spacing } from '@/lib/design-system';

// px-4 sm:px-6 lg:px-8
<div className={spacing.page}>

// p-4 sm:p-6
<Card className={spacing.card}>
```

---

## Touch Targets

All interactive elements must meet the **44×44px minimum touch target** (WCAG 2.5.5).

```tsx
import { interactive } from '@/lib/design-system';

// Button
<button className={interactive.button}>Save</button>

// Icon button
<button className={interactive.iconButton} aria-label="Close">
  <X size={20} />
</button>

// Custom element
<div className={interactive.minTouchTarget} role="button" tabIndex={0}>
```

---

## Responsive Images

Use Next.js `<Image>` with design system dimensions and `sizes`:

```tsx
import Image from 'next/image';
import { images } from '@/lib/design-system';

<Image
  src={avatarUrl}
  alt={patientName}
  width={images.avatar.width}
  height={images.avatar.height}
  sizes={images.sizes.avatar}
  className="rounded-full object-cover"
/>

<Image
  src={heroImage}
  alt="Dashboard hero"
  width={images.hero.width}
  height={images.hero.height}
  sizes={images.sizes.hero}
  priority
  className="w-full h-auto object-cover"
/>
```

---

## Mobile-First Checklist

Before marking a component as done, verify:

- [ ] No horizontal scroll on 320px viewport
- [ ] All interactive elements are ≥ 44×44px
- [ ] Text is readable without zooming (≥ 16px body on mobile)
- [ ] Touch targets have sufficient spacing (≥ 8px gap)
- [ ] Images use `sizes` attribute for responsive loading
- [ ] Grids collapse to single column on mobile
- [ ] No fixed-pixel widths that break on small screens
- [ ] Focus indicators visible at all breakpoints
- [ ] Tested on Chrome DevTools at 320px, 375px, 768px, 1024px, 1440px

---

## Lighthouse Targets

| Metric | Target |
|--------|--------|
| Performance (mobile) | > 90 |
| Accessibility | > 95 |
| Best Practices | > 90 |
| SEO | > 90 |

Run locally: `npx lighthouse http://localhost:3000 --only-categories=performance,accessibility --form-factor=mobile`

---

## Anti-Patterns to Avoid

```tsx
// ❌ Fixed pixel widths
<div style={{ width: '800px' }}>

// ✓ Responsive max-width
<div className="w-full max-w-3xl">

// ❌ Hardcoded small touch targets
<button className="h-6 w-6">

// ✓ Touch-friendly
<button className={interactive.iconButton}>

// ❌ Desktop-first breakpoints (hiding on mobile)
<div className="block md:hidden">  // only when intentional
<div className="hidden md:block">  // prefer mobile-first show

// ✓ Mobile-first (add complexity upward)
<div className="flex flex-col sm:flex-row">
```
