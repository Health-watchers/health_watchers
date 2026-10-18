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
