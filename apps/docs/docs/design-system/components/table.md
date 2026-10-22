---
title: Table
sidebar_label: Table
sidebar_position: 7
description: Composable data table with responsive horizontal scrolling, dark mode, and accessible header cells.
---

# Table

`apps/web/src/components/ui/Table.tsx`

A set of six composable parts that build accessible, responsive HTML tables.
The outer `<Table>` wrapper handles horizontal overflow automatically.

---

## Import

```tsx
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableTh,
  TableTd,
} from '@/components/ui';
```

---

## Basic usage

```tsx
<Table>
  <TableHead>
    <TableRow>
      <TableTh>Patient</TableTh>
      <TableTh>Date of birth</TableTh>
      <TableTh>Status</TableTh>
      <TableTh>Last visit</TableTh>
    </TableRow>
  </TableHead>
  <TableBody>
    <TableRow>
      <TableTd>Jane Doe</TableTd>
      <TableTd>1985-04-12</TableTd>
      <TableTd><Badge variant="success">Active</Badge></TableTd>
      <TableTd>2026-10-15</TableTd>
    </TableRow>
    <TableRow>
      <TableTd>John Smith</TableTd>
      <TableTd>1972-11-30</TableTd>
      <TableTd><Badge variant="warning">Pending</Badge></TableTd>
      <TableTd>2026-09-28</TableTd>
    </TableRow>
  </TableBody>
</Table>
```

---

## Parts reference

### `Table`

Renders `<div class="overflow-x-auto …"> <table> … </table> </div>`.

The outer `div` provides horizontal scrolling on small viewports so the table
never overflows the page.

| Style | Value |
|-------|-------|
| Wrapper | `w-full overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700` |
| Inner `<table>` | `w-full text-sm text-neutral-700 dark:text-neutral-300` |

---

### `TableHead`

Renders `<thead>` with a bottom border and a subtle background:

```
border-b border-neutral-200 bg-neutral-50
```

Dark mode: inherits the page dark background.

---

### `TableBody`

Renders `<tbody>` with dividers between rows:

```
divide-y divide-neutral-100 dark:divide-neutral-700
```

---

### `TableRow`

Renders `<tr>` with a hover state:

```
transition-colors hover:bg-neutral-50
```

For clickable rows, add `cursor-pointer` and an `onClick` handler:

```tsx
<TableRow
  className="cursor-pointer"
  onClick={() => router.push(`/patients/${id}`)}
>
  …
</TableRow>
```

---

### `TableTh`

Renders `<th scope="col">` — the `scope="col"` is set automatically for
accessibility. Style:

```
px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500
```

---

### `TableTd`

Renders `<td>`:

```
px-4 py-3 text-neutral-700 dark:text-neutral-300
```

---

## With Card wrapper

Wrap in `<Card padding="none">` to get a card surface with the table filling
the card edge-to-edge:

```tsx
<Card padding="none">
  <CardHeader className="px-6 py-4">
    <CardTitle>Payments</CardTitle>
  </CardHeader>
  <Table>
    …
  </Table>
</Card>
```

---

## Sorting columns

Add a sort button inside `TableTh` — the `TableTh` renders as `<th>` so the
button is correctly associated with the column:

```tsx
<TableTh>
  <button
    className="flex items-center gap-1 hover:text-neutral-800"
    onClick={() => toggleSort('date')}
    aria-label="Sort by date"
  >
    Date
    <ChevronUpDownIcon className="h-3 w-3" aria-hidden="true" />
  </button>
</TableTh>
```

---

## Empty state

Use `EmptyState` from the design system when the table has no rows:

```tsx
<Table>
  <TableHead>
    <TableRow>
      <TableTh>Name</TableTh>
      <TableTh>Status</TableTh>
    </TableRow>
  </TableHead>
  <TableBody>
    {rows.length === 0 ? (
      <TableRow>
        <TableTd colSpan={2}>
          <EmptyState illustration="patients" title="No patients found" />
        </TableTd>
      </TableRow>
    ) : (
      rows.map(…)
    )}
  </TableBody>
</Table>
```

---

## Accessibility

- `TableTh` always renders `scope="col"` — this associates header cells with
  their columns for screen readers.
- For row headers (e.g. patient name at the start of each row), add
  `scope="row"` explicitly: `<TableTh scope="row">Jane Doe</TableTh>`.
- Complex tables (multi-level headers, merged cells) should use `id` + `headers`
  attributes. See [WCAG technique H43](https://www.w3.org/WAI/WCAG21/Techniques/html/H43).
- Provide a `<caption>` as the first child of `<Table>` (or via an
  `aria-label` on the wrapper `<table>`) to describe the table's purpose to
  screen-reader users:

  ```tsx
  <Table aria-label="Patient list — 42 records">
    …
  </Table>
  ```

- Ensure sufficient contrast between table text (`neutral-700` on white = **10.7:1** ✅)
  and header text (`neutral-500` on `neutral-50` = **4.62:1** ✅).
