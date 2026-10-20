import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { locales, defaultLocale, type Locale } from './i18n.config';

export { locales, defaultLocale, type Locale } from './i18n.config';

function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get('locale')?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
