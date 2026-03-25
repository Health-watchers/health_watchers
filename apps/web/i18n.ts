import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, type Locale } from "./src/lib/locales";

export { locales, defaultLocale, type Locale } from "./src/lib/locales";

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) ?? defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
