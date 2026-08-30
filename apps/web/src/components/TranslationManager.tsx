'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Locale } from '@/i18n.config';

const LANGUAGE_MAP: Record<Locale, { name: string; nativeName: string; flag: string }> = {
  en: { name: 'English', nativeName: 'English', flag: '🇺🇸' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  pt: { name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  yo: { name: 'Yoruba', nativeName: 'Yoruba', flag: '🇳🇬' },
  ha: { name: 'Hausa', nativeName: 'Hausa', flag: '🇳🇪' },
};

async function setLanguage(locale: Locale) {
  const response = await fetch('/api/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  });

  if (!response.ok) {
    throw new Error('Failed to set language');
  }
}

export function TranslationManager() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleLocaleChange = (newLocale: Locale) => {
    startTransition(async () => {
      await setLanguage(newLocale);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-3 text-lg font-semibold">Language Selection</h3>
        <p className="mb-4 text-sm text-gray-600">Choose your preferred language</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {(Object.entries(LANGUAGE_MAP) as Array<[Locale, (typeof LANGUAGE_MAP)[Locale]]>).map(
          ([lang, { name, nativeName, flag }]) => (
            <button
              key={lang}
              onClick={() => handleLocaleChange(lang)}
              disabled={isPending}
              className={`rounded-lg border-2 p-3 text-center transition-all ${
                locale === lang
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } disabled:opacity-50`}
            >
              <div className="mb-2 text-2xl">{flag}</div>
              <div className="text-xs font-medium">{name}</div>
              <div className="text-xs text-gray-600">{nativeName}</div>
            </button>
          )
        )}
      </div>

      <div className="mt-6 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        <p>
          Current language: <strong>{LANGUAGE_MAP[locale].nativeName}</strong>
        </p>
      </div>
    </div>
  );
}
