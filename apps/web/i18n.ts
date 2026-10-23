import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { enabledLocales, defaultLocale } from './i18n.config';

export { locales, defaultLocale, type Locale } from './i18n.config';

function isEnabledLocale(value: string | undefined): value is string {
  return !!value && enabledLocales.includes(value);
}

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get('locale')?.value;
  const locale = isEnabledLocale(cookieLocale) ? cookieLocale : defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
