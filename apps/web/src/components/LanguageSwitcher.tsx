'use client';

import { useRouter } from 'next/navigation';
import type { Locale } from '../../i18n.config';

const LABELS: Record<Locale, string> = { en: 'EN', fr: 'FR' };

export default function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();

  const toggle = async (locale: Locale) => {
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => {});
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
    router.refresh();
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Language switcher">
      {(Object.keys(LABELS) as Locale[]).map((loc) => (
        <button
          key={loc}
          onClick={() => toggle(loc)}
          aria-pressed={current === loc}
          className={[
            'focus-visible:ring-primary-500 rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2',
            current === loc
              ? 'bg-primary-500 text-white'
              : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800',
          ].join(' ')}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  );
}
