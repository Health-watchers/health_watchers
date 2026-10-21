---
title: Card
sidebar_label: Card
sidebar_position: 6
description: Composable card component with padding variants and CardHeader/CardTitle/CardContent sub-components.
---

# Card

`apps/web/src/components/ui/Card.tsx`

A surface container used to group related content. Composed from four
sub-components: `Card`, `CardHeader`, `CardTitle`, and `CardContent`.

---

## Import

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
```

---

## Basic usage

```tsx
<Card>
  <CardHeader>
    <CardTitle>Patient summary</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Jane Doe — DOB 1985-04-12</p>
  </CardContent>
</Card>
```

---

## Padding variants

The `padding` prop controls the internal spacing of `<Card>`.

| Variant | Class | Use case |
|---------|-------|----------|
| `none` | — | When the card wraps a component with its own padding (e.g. a table) |
| `sm` | `p-3` | Compact cards (stat tiles, small widgets) |
| `md` *(default)* | `p-6` | Standard content cards |
| `lg` | `p-8` | Hero cards, onboarding panels |

```tsx
<Card padding="none">
  <Table>…</Table>
</Card>

<Card padding="sm">
  <p className="text-2xl font-bold">142</p>
  <p className="text-sm text-neutral-500">Patients this week</p>
</Card>

<Card padding="lg">
  <h1>Welcome back, Dr. Smith</h1>
</Card>
```

---

## Sub-components

### `CardHeader`

A flex row with `items-center justify-between` — ideal for a title + actions
layout.

```tsx
<CardHeader>
  <CardTitle>Upcoming appointments</CardTitle>
  <Button size="sm" variant="outline">View all</Button>
</CardHeader>
```

### `CardTitle`

A semantic `<h3>` with `text-lg font-semibold text-neutral-800`. Override the
heading level with `as` if needed by passing a custom className and an `h2` /
`h4` element instead.

```tsx
<CardTitle>Lab results</CardTitle>
```

### `CardContent`

A pass-through `<div>` — use it to wrap card body content for consistent
composability.

```tsx
<CardContent>
  <p>No lab results on record.</p>
</CardContent>
```

---

## Full composition example

```tsx
<Card>
  <CardHeader>
    <CardTitle>Recent payments</CardTitle>
    <Badge variant="success">3 confirmed</Badge>
  </CardHeader>
  <CardContent>
    <Table>
      <TableHead>
        <TableRow>
          <TableTh>Date</TableTh>
          <TableTh>Amount</TableTh>
          <TableTh>Status</TableTh>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableTd>2026-10-18</TableTd>
          <TableTd>120 XLM</TableTd>
          <TableTd><Badge variant="success">Confirmed</Badge></TableTd>
        </TableRow>
      </TableBody>
    </Table>
  </CardContent>
</Card>
```

---

## Props

### `Card`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Internal padding |
| `className` | `string` | — | Additional Tailwind classes |
| `...rest` | `HTMLAttributes<HTMLDivElement>` | — | All div attributes |

### `CardHeader`, `CardContent`

Both accept all `HTMLAttributes<HTMLDivElement>` + `className`.

### `CardTitle`

Accepts all `HTMLAttributes<HTMLHeadingElement>` + `className`.

---

## Dark mode

The card shell automatically adapts:

- Light: `bg-white border-neutral-200`
- Dark: `bg-neutral-900 border-neutral-700`

`CardTitle` uses `text-neutral-800` (add `dark:text-neutral-100` if overriding
with a custom `className`).

---

## Accessibility

- `Card` renders as a plain `<div>`. It carries no implicit ARIA role.
- Assign `role="article"` or `role="region"` + `aria-label` when the card
  represents a distinct piece of content that a screen-reader user may want to
  navigate to directly.
- `CardTitle` renders as `<h3>`. Ensure heading levels are correct for the
  page outline — wrap in an `<h2>` instead when it is the first heading within
  a page section.
