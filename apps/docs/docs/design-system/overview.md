---
title: Design System Overview
sidebar_label: Overview
sidebar_position: 1
description: Introduction to the Health Watchers design system — component library, design tokens, and contribution guidelines.
---

# Design System

The Health Watchers design system is the single source of truth for UI
consistency across the platform. It covers:

- **Component library** — 30+ production-ready React components in
  `apps/web/src/components/ui/`
- **Design tokens** — color palettes, typography scale, spacing, shadows, and
  border-radius defined in `apps/web/src/app/globals.css` and mirrored in
  `apps/web/tailwind.config.ts`
- **Responsive utilities** — breakpoints, grid layouts, and interactive-size
  constants in `apps/web/src/lib/design-system.ts`
- **Accessibility standards** — WCAG 2.1 AA compliance baked into every
  component (focus management, color contrast, ARIA patterns)

---

## Tech stack

| Layer | Tool |
|-------|------|
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + `@tailwindcss/forms` + `@tailwindcss/typography` |
| Variant management | [`class-variance-authority`](https://cva.style) (CVA) |
| Dark mode | Class-based (`dark` on `<html>`), toggled by `ThemeToggle`, persisted in `localStorage` |
| Font | [Inter](https://rsms.me/inter/) via `font-family-sans` token |
| Icons | Inline SVG / Lucide (no icon-font dependency) |

---

## Figma designs

The UI Designs folder at the repo root contains exported Figma screens:

- **Health Watchers Design System — Screens** — full design-system component screens
- **Design Figma screens — Settings & Profile page** — settings page reference

These are the authoritative design references. When implementing a new
component, cross-check against the Figma source before committing.

---

## Adding a new component

1. Create `apps/web/src/components/ui/MyComponent.tsx`.
2. Use CVA for variant management and follow the existing `forwardRef` pattern.
3. Export from `apps/web/src/components/ui/index.ts`.
4. Ensure WCAG 2.1 AA contrast (4.5:1 for normal text, 3:1 for large text).
5. Add `aria-*` attributes — see the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/).
6. Document it under `apps/docs/docs/design-system/components/` following this
   site's conventions.

---

## Section contents

| Page | What's covered |
|------|---------------|
| [Color Palette](./tokens/colors) | All palettes, hex values, WCAG contrast ratings |
| [Typography](./tokens/typography) | Font scale, responsive levels, utility classes |
| [Spacing & Layout](./tokens/spacing) | Spacing tokens, grid presets, z-index scale |
| [Button](./components/button) | All 5 variants × 3 sizes, loading state, accessibility |
| [Input](./components/input) | Label, error, helper, icons, validation states |
| [Modal](./components/modal) | Sizes, focus trap, keyboard nav, ARIA pattern |
| [Toast](./components/toast) | Controlled vs imperative, variants, ARIA live regions |
| [Badge](./components/badge) | All 5 variants |
| [Card](./components/card) | Padding variants, composition with CardHeader/CardTitle/CardContent |
| [Table](./components/table) | Composable parts, responsive overflow, dark mode |
