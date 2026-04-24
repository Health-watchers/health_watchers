import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, type Locale } from './i18n.config';

export { locales, defaultLocale, type Locale } from './i18n.config';

export default getRequestConfig(async () => {
  const locale = ((await cookies()).get('locale')?.value as Locale) ?? defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
