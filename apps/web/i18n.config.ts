export const locales = ['en', 'fr', 'pt', 'ha', 'yo'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

/** Map locale → HTML dir attribute (RTL-ready) */
export const localeDir: Record<Locale, 'ltr' | 'rtl'> = {
  en: 'ltr',
  fr: 'ltr',
  pt: 'ltr',
  ha: 'ltr',
  yo: 'ltr',
};
