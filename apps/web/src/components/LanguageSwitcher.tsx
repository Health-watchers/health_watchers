'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { locales, type Locale } from '../../i18n.config';

export default function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const t = useTranslations('language');
  const [isPending, startTransition] = useTransition();

  const change = async (locale: Locale) => {
    if (locale === current) return;
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => {});
    document.cookie = `locale=${locale};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center">
      <label htmlFor="language-switcher" className="sr-only">
        {t('label')}
      </label>
      <select
        id="language-switcher"
        value={current}
        disabled={isPending}
        onChange={(e) => change(e.target.value as Locale)}
        className="focus-visible:ring-primary-500 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-xs font-medium text-neutral-600 focus:outline-none focus-visible:ring-2 disabled:opacity-60 dark:border-neutral-600 dark:text-neutral-300"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {t(loc)}
          </option>
        ))}
      </select>
    </div>
  );
}
