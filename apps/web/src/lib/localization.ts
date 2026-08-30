import { formatDate, formatDistanceToNow, parseISO } from 'date-fns';
import { enUS, fr, pt, ptBR } from 'date-fns/locale';

export type Locale = 'en' | 'fr' | 'pt' | 'yo' | 'ha';

export const dateLocaleMap: Record<Locale, any> = {
  en: enUS,
  fr,
  pt: ptBR,
  yo: enUS,
  ha: enUS,
};

export const currencyMap: Record<Locale, string> = {
  en: 'USD',
  fr: 'EUR',
  pt: 'BRL',
  yo: 'NGN',
  ha: 'NGN',
};

export const rtlLocales: Locale[] = [];

export function formatLocalizedDate(
  date: Date | string,
  locale: Locale,
  format: string = 'PPP'
): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDate(dateObj, format, {
    locale: dateLocaleMap[locale],
  });
}

export function formatLocalizedTime(
  date: Date | string,
  locale: Locale,
  format: string = 'p'
): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDate(dateObj, format, {
    locale: dateLocaleMap[locale],
  });
}

export function formatRelativeTime(date: Date | string, locale: Locale): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(dateObj, {
    addSuffix: true,
    locale: dateLocaleMap[locale],
  });
}

export function formatCurrency(amount: number, locale: Locale): string {
  const currency = currencyMap[locale];
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
  };

  return new Intl.NumberFormat(getIntlLocale(locale), options).format(amount);
}

export function getIntlLocale(locale: Locale): string {
  const localeMap: Record<Locale, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    pt: 'pt-BR',
    yo: 'yo-NG',
    ha: 'ha-NG',
  };
  return localeMap[locale];
}

export function isRTLLocale(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

export function formatPlural(
  count: number,
  locale: Locale,
  singular: string,
  plural: string
): string {
  if (locale === 'fr' || locale === 'pt') {
    return count > 1 ? plural : singular;
  }
  if (locale === 'yo' || locale === 'ha') {
    return plural;
  }
  return count === 1 ? singular : plural;
}
