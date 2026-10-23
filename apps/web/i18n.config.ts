export const locales = ['en', 'fr', 'pt', 'yo', 'ha'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/**
 * Pseudo-locale generated from en.json by scripts/generate-pseudo-locale.mjs.
 * Development only: it is never offered to users and is absent from production builds.
 */
export const pseudoLocale = 'en-XA';

/** Locales the server will accept from the `locale` cookie. */
export const enabledLocales: readonly string[] =
  process.env.NODE_ENV === 'development' ? [...locales, pseudoLocale] : locales;

/**
 * RTL locale support (e.g. Arabic — 'ar')
 * ─────────────────────────────────────────
 * When Arabic or another right-to-left language is added:
 *
 *  1. Add the locale code to the `locales` array above (e.g. 'ar').
 *  2. Create `apps/web/messages/ar.json` matching all keys in `en.json`.
 *  3. Add 'ar' to the `RTL_LOCALES` set below so the layout can set
 *     `<html dir="rtl">` automatically.
 *  4. Ensure Tailwind's `rtl:` variant is enabled (it is by default in v3+).
 *     Audit component classes that use directional utilities (ml-*, pl-*, etc.)
 *     and add their `rtl:` mirrors, or replace them with logical properties
 *     (ms-*, ps-*) which flip automatically.
 *  5. Run `scripts/check-translations.ts` to verify key parity.
 */
export const RTL_LOCALES: ReadonlySet<string> = new Set<string>([
  // 'ar', // Arabic — uncomment when ready
]);

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}
