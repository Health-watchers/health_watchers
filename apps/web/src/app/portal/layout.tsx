import Link from 'next/link';
import { cookies } from 'next/headers';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { locales, defaultLocale, type Locale } from '../../../i18n.config';

function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const cookieLocale = (await cookies()).get('locale')?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale;
  const t = await getTranslations({ locale, namespace: 'portal' });

  const NAV = [
    { href: '/portal/dashboard', label: t('nav.dashboard') },
    { href: '/portal/timeline', label: t('nav.timeline') },
    { href: '/portal/records', label: t('nav.records') },
    { href: '/portal/encounters', label: t('nav.encounters') },
    { href: '/portal/appointments', label: t('nav.appointments') },
    { href: '/portal/payments', label: t('nav.payments') },
    { href: '/portal/consent', label: t('nav.consent') },
    { href: '/portal/health-log', label: t('nav.healthLog') },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white shadow-sm dark:bg-gray-800 dark:shadow-gray-900/50">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
            {t('brand')}
          </span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher current={locale} />
            <form action="/api/portal/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {t('signOut')}
              </button>
            </form>
          </div>
        </div>
        <nav
          aria-label={t('brand')}
          className="mx-auto max-w-4xl overflow-x-auto px-4"
        >
          <ul className="flex gap-1 pb-1">
            {NAV.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="block rounded-t-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-300"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 text-gray-900 dark:text-gray-100">
        {children}
      </main>
    </div>
  );
}
