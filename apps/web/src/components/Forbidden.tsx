'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** 403 view shown when the signed-in user lacks the role required for a page. */
export function Forbidden() {
  const t = useTranslations('forbidden');

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <p className="text-5xl font-bold text-neutral-800 dark:text-neutral-100">403</p>
      <h1 className="text-xl font-semibold text-neutral-800 dark:text-neutral-100">{t('title')}</h1>
      <p className="max-w-md text-neutral-500 dark:text-neutral-400">{t('description')}</p>
      <Link href="/" className="text-primary-600 hover:underline">
        {t('home')}
      </Link>
    </div>
  );
}
