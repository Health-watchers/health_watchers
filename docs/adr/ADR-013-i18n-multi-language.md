# ADR-013: Internationalisation (i18n) and Multi-Language Support

## Status

Accepted

## Date

2024-05-10

## Context

Health Watchers targets clinics across West Africa and the global diaspora. The primary markets include:

- Anglophone West Africa (English)
- Francophone West Africa (French)
- Lusophone Africa (Portuguese)
- Yoruba-speaking communities (Yorùbá)
- Hausa-speaking communities (Hausa)

The web frontend must support all five locales. Clinical terminology must be accurate in each language. Missing translations must not cause runtime crashes — a fallback to the default locale is acceptable.

The CI pipeline must detect missing translations before they reach production to avoid blank labels in the UI.

## Decision

### Library — next-intl

**next-intl ^4.9** is used for the Next.js 14 App Router web application.

Reasons for choosing next-intl:

- First-class Next.js App Router support (server components, layouts, middleware)
- Type-safe message access via TypeScript generics
- ICU message format support (plurals, gender, number/date formatting per locale)
- Lazy-loading of locale message bundles (only the active locale is loaded)

### Locale configuration

| Locale code | Language | Default? |
|-------------|---------|---------|
| `en` | English | ✅ |
| `fr` | French | |
| `pt` | Portuguese | |
| `yo` | Yorùbá | |
| `ha` | Hausa | |

`defaultLocale: 'en'`. If a message key is missing in the active locale, next-intl falls back to the `en` bundle silently (no runtime error).

### File structure

```
apps/web/messages/
  en.json     — English (source of truth; all keys must be present)
  fr.json
  pt.json
  yo.json
  ha.json
```

The `en.json` file is the canonical key source. All other locales must have a matching key set.

### Translation quality check in CI

A TypeScript script (`scripts/check-translations.ts`) runs in the `quality-checks` stage of CI. It:

1. Loads all five locale files
2. Recursively compares keys against `en.json`
3. Reports missing and extra keys as a JSON report (`scripts/translation-report.json`)
4. Exits with code 1 if any key is missing in any locale

The report is uploaded as a CI artifact (retained 7 days). This prevents blank UI labels from shipping.

### Pre-commit hook

`.husky/pre-commit-translations` runs the translation check before every commit, catching issues locally before they reach CI.

### Date, number, and currency formatting

All locale-sensitive values (dates, numbers, currencies) are formatted using `intl-messageformat` and the browser's `Intl` API, not hard-coded string concatenation. The `locale` from the URL segment (`/en/`, `/fr/`, etc.) controls formatting.

Currency: XLM amounts displayed via `Intl.NumberFormat` with appropriate decimal places per locale. Local currency conversion (for display only) uses the live XLM/USD rate fetched from the API.

### Locale routing

Locale is determined from the URL prefix (`/en/dashboard`, `/fr/dashboard`). next-intl middleware handles locale detection and redirects from the root path based on the `Accept-Language` header.

### Backend API

The API returns data in a locale-neutral format (ISO dates, numeric values, enum codes). All locale-specific rendering is the responsibility of the frontend. This keeps the API simple and locale-independent.

Error messages returned by the API are in English; the frontend translates `ApiErrorCode` values to locale-specific messages using the message bundle.

## Consequences

### Positive

- CI translation check prevents blank labels from reaching production.
- next-intl's type-safe message access catches typos in translation keys at compile time.
- Locale-neutral API responses mean adding a new locale requires only frontend changes.
- ICU message format handles complex pluralisation correctly for all five languages.

### Negative / Trade-offs

- Yorùbá and Hausa have limited tooling support for automated translation quality checks; human review is required.
- Maintaining five locale files means every new UI string must be added to all five files simultaneously.
- RTL (right-to-left) layout is not needed for current locales but would require significant CSS changes if added later.

### Neutral

- The `yo` and `ha` locale bundles may lag behind `en` during rapid feature development; the fallback mechanism ensures the UI remains functional.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| react-i18next | next-intl is specifically designed for Next.js App Router; react-i18next works but requires more manual integration |
| i18n route-based (e.g. `pages/[locale]/`) | App Router's native locale routing via next-intl middleware is cleaner |
| Server-side translation (API returns localised strings) | Couples the API to locale logic; prevents locale switching without an API call |

## References

- `apps/web/messages/` — locale message bundles
- `scripts/check-translations.ts` — CI translation validation
- `.husky/pre-commit-translations` — pre-commit translation hook
- `.github/workflows/ci.yml` — translation check in quality-checks stage
- `.changeset/feat-i18n-multi-language.md` — feature changeset
