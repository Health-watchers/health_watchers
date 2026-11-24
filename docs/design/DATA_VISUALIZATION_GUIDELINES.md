# Data Visualisation Guidelines

> **GitHub Issue:** [#1403](https://github.com/Health-watchers/health_watchers/issues/1403)
> **Labels:** design, dataviz, accessibility
> **Difficulty:** Medium

---

## Overview

Chart components across the app (`components/charts/*`, `VitalSignsChart`, `HealthMetricTrendChart`, `PaymentAnalyticsCharts`) each choose their own colours, axis styles, and tooltip patterns. This document establishes consistent, accessible guidelines for all clinical and payment charts across web and mobile.

These guidelines are the canonical reference. All chart components should be updated to comply, and the rules should be published in the Docusaurus site under **Design**.

---

## Colour Palettes

All palettes are defined as `color.dataviz.*` tokens in `packages/design-tokens/tokens/color.json` (see `docs/design/DESIGN_TOKEN_PIPELINE.md`). Every colour meets **3:1 non-text contrast** against both the light background (`color.neutral.0` / `#FFFFFF`) and the dark background (`color.neutral.950` / `#0A0A0A`).

### Categorical Palette

Use for distinguishing unordered data series (e.g. multiple vital signs on one chart, multiple payment categories).

| Token | Light Mode Hex | Dark Mode Hex | Usage |
|---|---|---|---|
| `color.dataviz.cat.1` | `#0057B8` | `#4D9FFF` | Series 1 |
| `color.dataviz.cat.2` | `#D4480A` | `#FF7A45` | Series 2 |
| `color.dataviz.cat.3` | `#0E7C4A` | `#34C97A` | Series 3 |
| `color.dataviz.cat.4` | `#7B2D8B` | `#C07DD6` | Series 4 |
| `color.dataviz.cat.5` | `#B58B00` | `#F0C040` | Series 5 |
| `color.dataviz.cat.6` | `#005F73` | `#5AC8DB` | Series 6 |

Rules:
- Use series in order (cat.1 first, cat.2 second, etc.) so the same metric always maps to the same colour across different charts.
- Never use more than 6 categories on a single chart. If more are needed, group smaller series into "Other".
- Each series must also be distinguishable by pattern or shape (dashed vs solid line, circle vs square marker) so colour is not the sole differentiator.

### Sequential Palette

Use for ordered single-variable data where magnitude matters (e.g. risk score gradient, lab result intensity).

| Token | Hex (Light) | Hex (Dark) |
|---|---|---|
| `color.dataviz.seq.1` | `#EFF6FF` | `#1E3A5F` |
| `color.dataviz.seq.2` | `#BFDBFE` | `#2563EB` |
| `color.dataviz.seq.3` | `#60A5FA` | `#3B82F6` |
| `color.dataviz.seq.4` | `#2563EB` | `#60A5FA` |
| `color.dataviz.seq.5` | `#1D4ED8` | `#93C5FD` |

Steps 1 → 5 go from low to high intensity. Use at least 3 steps for a gradient fill.

### Diverging Palette

Use when data has a meaningful midpoint (e.g. deviation from a reference range, budget variance).

| Token | Hex (Light) | Meaning |
|---|---|---|
| `color.dataviz.div.low-2` | `#B91C1C` | Well below midpoint |
| `color.dataviz.div.low-1` | `#FCA5A5` | Slightly below midpoint |
| `color.dataviz.div.mid` | `#E5E7EB` | At midpoint / neutral |
| `color.dataviz.div.high-1` | `#86EFAC` | Slightly above midpoint |
| `color.dataviz.div.high-2` | `#15803D` | Well above midpoint |

Dark-mode equivalents are defined in `color.json` as aliases that resolve to adjusted hex values maintaining the same 3:1 contrast floor.

---

## Clinical Reference Ranges and Critical Values

### Reference Range Bands

A shaded band indicates the normal reference range for a clinical metric (e.g. normal heart rate 60–100 bpm).

| Property | Spec |
|---|---|
| Fill colour | `color.dataviz.ref.band` — `rgba(0, 87, 184, 0.08)` light / `rgba(77, 159, 255, 0.12)` dark |
| Border | None |
| Label | Short text label ("Normal range") placed at the top-right corner of the band, in `color.dataviz.ref.label` |
| Interaction | Tooltip on hover/tap shows exact numeric range |

### Critical Value Markers

Critical values (results outside safe thresholds) are marked with a distinct visual treatment.

| Property | Spec |
|---|---|
| Line / marker colour | `color.semantic.error` (`#DC2626` light / `#F87171` dark) |
| Marker shape | Filled diamond (◆), 8 px, on the data point |
| Annotation | "Critical" text label with an alert icon attached to the marker |
| Accessibility | `aria-label` on the marker element announces "Critical value: [value] [unit] at [date/time]" |

### High / Low Warning Markers

Values outside the reference range but below the critical threshold use warning treatment.

| Property | Spec |
|---|---|
| Marker colour | `color.semantic.warning` (`#F59E0B` light / `#FCD34D` dark) |
| Marker shape | Filled triangle (▲ for high, ▼ for low), 8 px |
| Annotation | "High" or "Low" label on hover/tap |

---

## Tooltip Spec

Tooltips appear on hover (desktop) or tap (mobile) for every data point.

### Content Structure

```
┌────────────────────────────┐
│  Mon 29 Sep 2026, 10:42    │
│  ─────────────────────     │
│  ● Heart Rate    78 bpm    │
│  ● Blood Pressure 120/80   │
│  ⚠ High  SpO₂   94 %      │
└────────────────────────────┘
```

| Property | Spec |
|---|---|
| Background | `color.neutral.0` light / `color.neutral.900` dark, with `shadow.md` |
| Border | 1 px `color.neutral.200` light / `color.neutral.700` dark |
| Radius | `radius.md` |
| Typography | `font.size.sm` for timestamp, `font.size.base` for values |
| Series colour dot | Matches the series colour token, 8 px circle |
| Status icon | Warning (⚠) or Critical (✕) shown inline for out-of-range values |
| Position | Prefer top-right of cursor; flip to avoid viewport overflow |
| Dismiss | Tooltip auto-hides on mouse-leave / tap-away; persistent tooltip option for mobile long-press |
| ARIA | `role="tooltip"` with `id` linked from the data point via `aria-describedby` |

---

## Legend Spec

| Property | Spec |
|---|---|
| Position | Below the chart (default) or to the right for wide charts (> 600 px) |
| Item layout | Horizontal row, wraps to multiple lines; never truncates |
| Colour swatch | 12 × 12 px rounded square matching the series colour token |
| Pattern swatch | For print / high-contrast, also shows the line pattern (solid, dashed, dotted) |
| Interactive | Clicking a legend item toggles the series visibility (opacity 0.15 when hidden) |
| Typography | `font.size.sm`, `font.weight.normal` |

---

## Axis Spec

### X-Axis (Time or Category)

| Property | Spec |
|---|---|
| Label colour | `color.neutral.600` light / `color.neutral.400` dark |
| Tick frequency | Auto-spaced; at most one label per 64 px of axis width |
| Date format | Adaptive: "10:42" (< 24 h), "Sep 29" (< 7 days), "29 Sep" (< 1 year), "Sep 2026" (multi-year) |
| Axis line | 1 px `color.neutral.200` light / `color.neutral.700` dark |

### Y-Axis (Value)

| Property | Spec |
|---|---|
| Label colour | Same as X-axis |
| Unit label | Shown as a rotated axis title (e.g. "bpm", "mg/dL") or appended to tick labels for short units |
| Tick count | 4–6 ticks; always include 0 for ratio-scale data |
| Scale | Linear by default; logarithmic only when data spans > 2 orders of magnitude (annotate the axis) |

---

## Gridline Spec

| Property | Spec |
|---|---|
| Horizontal gridlines | 1 px dashed, `color.neutral.100` light / `color.neutral.800` dark |
| Vertical gridlines | Hidden by default; shown only for scatter plots and when explicitly needed |
| Zero line | 1 px solid, `color.neutral.300` light / `color.neutral.600` dark; only shown when the axis crosses zero |

---

## Empty-Data and Partial-Data States

### Empty State (No Data)

Displayed when no data points exist for the selected time range or filters.

```
┌─────────────────────────────┐
│                             │
│      [Empty chart icon]     │
│   No data for this period   │
│  Try a different date range │
│                             │
└─────────────────────────────┘
```

- Chart axes are hidden.
- The empty state message is centred in the chart container.
- Icon uses `color.neutral.300` / `color.neutral.600`.
- Text uses `font.size.sm`, `color.neutral.500`.

### Partial Data State

Displayed when some data is missing within a range (e.g. gaps in a continuous monitoring stream).

- Existing data points are rendered normally.
- Gaps in a line chart are shown as a **dashed line segment** in `color.neutral.400` connecting the surrounding known points.
- A legend annotation "Estimated / missing data" explains the dashed segments.
- Hover over a gap segment shows a tooltip: "No data recorded between [start] and [end]".

### Loading State

- A skeleton loader (animated shimmer) fills the chart area at the expected chart dimensions.
- Axes show as grey placeholder bars.
- No data is rendered until the fetch resolves.

---

## Figma Deliverables

All frames are placed under **UI Designs / Design System / Data Visualisation** in the shared Figma file.

- [ ] Categorical palette swatches — light and dark mode
- [ ] Sequential palette swatches — light and dark mode
- [ ] Diverging palette swatches — light and dark mode
- [ ] Line chart example — `VitalSignsChart` with reference band, critical marker, warning marker
- [ ] Bar chart example — `PaymentAnalyticsCharts`
- [ ] Area chart example — `HealthMetricTrendChart`
- [ ] Scatter plot example
- [ ] Tooltip component — all states
- [ ] Legend component — horizontal and vertical layouts
- [ ] Empty state illustration
- [ ] Partial data state
- [ ] Loading skeleton

---

## Docusaurus Publication

Once the Figma page is complete, publish the guidelines to the internal Docusaurus site:

- Location: `Design > Data Visualisation Guidelines`
- Include all palette tables, component specs, and links to Figma frames.
- The page must pass Docusaurus build (`npm run build --workspace=@health-watchers/docs`) before merging.

---

## Acceptance Criteria

- [ ] All palette swatches pass **3:1 non-text contrast** (WCAG 1.4.11) against both `color.neutral.0` (light) and `color.neutral.950` (dark). Verified with a tool such as the Colour Contrast Analyser.
- [ ] Colour is never the sole differentiator for any series — each series has a unique shape, pattern, or label in addition to colour.
- [ ] All chart tokens are committed to `packages/design-tokens/tokens/color.json` under `color.dataviz.*`.
- [ ] Guidelines are published in the Docusaurus site under **Design**.
- [ ] Figma page "Data Visualisation" is published in the shared design file with at least one example of each chart type listed above.

---

## Related

- `components/charts/` — existing chart component implementations
- `components/VitalSignsChart` — clinical vital signs chart
- `components/HealthMetricTrendChart` — health trend chart
- `components/PaymentAnalyticsCharts` — payment analytics charts
- `docs/design/DESIGN_TOKEN_PIPELINE.md` — how `color.dataviz.*` tokens are built and consumed
- `docs/RESPONSIVE_DESIGN_SYSTEM.md` — existing responsive design patterns
- Issue [#1402](https://github.com/Health-watchers/health_watchers/issues/1402) — Design token pipeline
