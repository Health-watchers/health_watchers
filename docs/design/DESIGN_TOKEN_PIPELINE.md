# Design Token Export Pipeline

> **GitHub Issue:** [#1402](https://github.com/Health-watchers/health_watchers/issues/1402)
> **Labels:** design, design-system, tooling
> **Difficulty:** Hard

---

## Overview

The web app currently has three separate Tailwind configs (`tailwind.config.js`, `tailwind.config.ts`, `tailwind.config.responsive.js`) and colours are hand-copied from Figma. This creates drift between design and code and duplicates values across web and mobile.

The goal is a single source of truth — a `packages/design-tokens` package — that designers update via Figma Tokens Studio, and that automatically generates:

- A **Tailwind theme extension** for the web app.
- A **React Native theme object** for the mobile app.

---

## Package Location

```
packages/
  design-tokens/
    tokens/             # W3C design-tokens JSON source files
      color.json
      typography.json
      spacing.json
      radius.json
      shadow.json
      motion.json
    build/              # Generated outputs (gitignored)
      tailwind-theme.js
      react-native-theme.ts
    sd.config.js        # Style Dictionary configuration
    package.json
    README.md
```

Package name: `@health-watchers/design-tokens`

---

## Token Format — W3C Design Tokens

All tokens are authored in the [W3C Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/) (`.json`). Each token has a `$value` and a `$type`.

### Example — `tokens/color.json`

```json
{
  "color": {
    "brand": {
      "primary": {
        "$value": "#0057B8",
        "$type": "color",
        "$description": "Primary brand blue"
      },
      "primary-hover": {
        "$value": "#004799",
        "$type": "color"
      }
    },
    "neutral": {
      "0":   { "$value": "#FFFFFF", "$type": "color" },
      "100": { "$value": "#F5F5F5", "$type": "color" },
      "200": { "$value": "#E5E5E5", "$type": "color" },
      "900": { "$value": "#111111", "$type": "color" }
    },
    "semantic": {
      "success": { "$value": "{color.brand.primary}", "$type": "color" },
      "warning": { "$value": "#F59E0B", "$type": "color" },
      "error":   { "$value": "#DC2626", "$type": "color" },
      "info":    { "$value": "#3B82F6", "$type": "color" }
    }
  }
}
```

### Example — `tokens/spacing.json`

```json
{
  "spacing": {
    "1":  { "$value": "4px",  "$type": "dimension" },
    "2":  { "$value": "8px",  "$type": "dimension" },
    "3":  { "$value": "12px", "$type": "dimension" },
    "4":  { "$value": "16px", "$type": "dimension" },
    "6":  { "$value": "24px", "$type": "dimension" },
    "8":  { "$value": "32px", "$type": "dimension" },
    "12": { "$value": "48px", "$type": "dimension" },
    "16": { "$value": "64px", "$type": "dimension" }
  }
}
```

### Token Categories

| File | Token types |
|---|---|
| `color.json` | `color.brand.*`, `color.neutral.*`, `color.semantic.*`, `color.dataviz.*` |
| `typography.json` | `font.family.*`, `font.size.*`, `font.weight.*`, `font.lineHeight.*`, `font.letterSpacing.*` |
| `spacing.json` | `spacing.*` (4 px base grid) |
| `radius.json` | `radius.*` (none, sm, md, lg, full) |
| `shadow.json` | `shadow.*` (sm, md, lg, inner) |
| `motion.json` | `motion.duration.*`, `motion.easing.*` |

---

## Build Tool — Style Dictionary

[Style Dictionary](https://amzn.github.io/style-dictionary/) transforms the W3C JSON source into platform-specific outputs via a config file (`sd.config.js`).

### `sd.config.js`

```js
const StyleDictionary = require('style-dictionary');

module.exports = {
  source: ['tokens/**/*.json'],
  platforms: {
    // Web — Tailwind theme extension
    web: {
      transformGroup: 'js',
      buildPath: 'build/',
      files: [
        {
          destination: 'tailwind-theme.js',
          format: 'javascript/module',
          options: {
            outputReferences: true,
          },
        },
      ],
    },
    // Mobile — React Native theme object
    reactNative: {
      transformGroup: 'react-native',
      buildPath: 'build/',
      files: [
        {
          destination: 'react-native-theme.ts',
          format: 'javascript/es6',
        },
      ],
    },
  },
};
```

### Build Command

```bash
npm run build --workspace=@health-watchers/design-tokens
```

This generates:
- `packages/design-tokens/build/tailwind-theme.js`
- `packages/design-tokens/build/react-native-theme.ts`

Both files are gitignored and regenerated on every build.

---

## Web Integration — Single Tailwind Config

After generating `tailwind-theme.js`, the web app uses a single Tailwind config that imports the generated theme:

### `tailwind.config.ts` (root — replaces all three existing configs)

```ts
import type { Config } from 'tailwindcss';
import { theme as designTokens } from '@health-watchers/design-tokens/build/tailwind-theme';

const config: Config = {
  content: [
    './apps/web/src/**/*.{ts,tsx}',
    './apps/portal/src/**/*.{ts,tsx}',
    './packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: designTokens.colors,
      fontFamily: designTokens.fontFamily,
      fontSize: designTokens.fontSize,
      fontWeight: designTokens.fontWeight,
      spacing: designTokens.spacing,
      borderRadius: designTokens.borderRadius,
      boxShadow: designTokens.boxShadow,
      transitionDuration: designTokens.transitionDuration,
      transitionTimingFunction: designTokens.transitionTimingFunction,
    },
  },
  plugins: [],
};

export default config;
```

The three existing Tailwind configs (`tailwind.config.js`, `tailwind.config.ts`, `tailwind.config.responsive.js`) are removed once all hard-coded hex values in the web app are replaced with token-based class names.

---

## Mobile Integration

The React Native app imports the generated theme object directly:

```ts
// apps/mobile/src/theme/index.ts
import theme from '@health-watchers/design-tokens/build/react-native-theme';
export default theme;
```

Screens and components reference tokens by name:

```ts
import theme from '../theme';

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.color.brand.primary,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
});
```

---

## Replacing Hard-Coded Hex Values

Before the old Tailwind configs can be removed, all hard-coded hex values in the web app must be replaced with token-based Tailwind classes or CSS custom properties.

### Migration Strategy

1. Run the token build to generate `tailwind-theme.js`.
2. Add the new single `tailwind.config.ts` (importing the generated theme) alongside the existing configs temporarily.
3. Use a codemod or search-and-replace to swap hard-coded hex values (`#0057B8`, etc.) with the corresponding Tailwind utility classes (`text-brand-primary`, `bg-brand-primary`, etc.).
4. Verify the web app builds and passes visual regression snapshots.
5. Delete the three old Tailwind configs.

Refer to `docs/RESPONSIVE_DESIGN_SYSTEM.md` for the existing responsive variant approach — the responsive plugin should be consolidated into the new config rather than removed.

---

## Designer Workflow — Figma Tokens Studio to PR

1. **Designer opens Figma** and edits token values in the [Tokens Studio for Figma](https://tokens.studio/) plugin.
2. **Tokens Studio pushes a PR** to the `packages/design-tokens/tokens/` directory (configured via the plugin's GitHub sync settings — repo, branch, file path).
3. **PR is reviewed** by a front-end engineer for any breaking changes (renamed tokens, removed tokens, contrast regressions).
4. **CI runs** `npm run build --workspace=@health-watchers/design-tokens` to confirm the build succeeds and generated outputs are consistent.
5. **PR is merged** — the monorepo's build pipeline regenerates both outputs on the next web/mobile build.

### Tokens Studio GitHub Sync Config (inside Figma plugin)

| Field | Value |
|---|---|
| Repository | `Health-watchers/health_watchers` |
| Branch | `tokens/update-design-tokens` (feature branch per update) |
| File path | `packages/design-tokens/tokens/` |
| Commit message | `chore(design-tokens): update tokens from Figma` |

---

## `packages/design-tokens/package.json`

```json
{
  "name": "@health-watchers/design-tokens",
  "version": "0.1.0",
  "description": "Single source of truth for Health Watchers design tokens",
  "main": "build/tailwind-theme.js",
  "types": "build/react-native-theme.d.ts",
  "scripts": {
    "build": "style-dictionary build --config sd.config.js",
    "clean": "rimraf build"
  },
  "devDependencies": {
    "style-dictionary": "3.9.2",
    "rimraf": "5.0.5"
  }
}
```

---

## Acceptance Criteria

- [ ] `npm run build --workspace=@health-watchers/design-tokens` completes without errors and produces both `tailwind-theme.js` and `react-native-theme.ts` under `build/`.
- [ ] The web app builds successfully using the single new `tailwind.config.ts` that imports the generated theme.
- [ ] No hard-coded hex colour values remain in `apps/web/` or `apps/portal/` after migration.
- [ ] The mobile app builds with theme values sourced from `react-native-theme.ts`.
- [ ] `packages/design-tokens/README.md` documents the full designer → engineer workflow.
- [ ] CI enforces the build step on any PR that touches `packages/design-tokens/tokens/`.

---

## Related

- `tailwind.config.js`, `tailwind.config.ts`, `tailwind.config.responsive.js` — existing configs to be consolidated
- `docs/RESPONSIVE_DESIGN_SYSTEM.md` — responsive variant approach to merge into new config
- `docs/design/DATA_VISUALIZATION_GUIDELINES.md` — `color.dataviz.*` tokens are defined here
- `docs/design/MOBILE_SCREENS.md` — mobile screens that consume these tokens
- Issue [#1403](https://github.com/Health-watchers/health_watchers/issues/1403) — Data visualisation guidelines (defines `color.dataviz.*`)
