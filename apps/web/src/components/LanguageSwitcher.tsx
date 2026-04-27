'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '../../i18n.config';
import { locales } from '../../i18n.config';

const LOCALE_META: Record<Locale, { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇬🇧' },
  fr: { label: 'Français', flag: '🇫🇷' },
  pt: { label: 'Português', flag: '🇧🇷' },
  ha: { label: 'Hausa', flag: '🇳🇬' },
  yo: { label: 'Yorùbá', flag: '🇳🇬' },
};

export default function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const select = async (locale: Locale) => {
    setOpen(false);
    // Persist in cookie (1 year)
    document.cookie = `locale=${locale};path=/;max-age=31536000;SameSite=Lax`;
    // Also call the API route so server-side cookie is set
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => {});
    // Save to localStorage for persistence across sessions
    try {
      localStorage.setItem('preferred-locale', locale);
    } catch {
      // ignore
    }
    router.refresh();
  };

  const currentMeta = LOCALE_META[current];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${currentMeta.label}`}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors"
      >
        <span aria-hidden="true">{currentMeta.flag}</span>
        <span className="hidden sm:inline">{currentMeta.label}</span>
        <span className="sm:hidden">{current.toUpperCase()}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop to close on outside click */}
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
          <ul
            role="listbox"
            aria-label="Select language"
            className="absolute end-0 z-20 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          >
            {locales.map((loc) => {
              const meta = LOCALE_META[loc];
              return (
                <li key={loc} role="option" aria-selected={loc === current}>
                  <button
                    type="button"
                    onClick={() => select(loc)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                      loc === current
                        ? 'bg-primary-50 font-semibold text-primary-600'
                        : 'text-neutral-700 hover:bg-neutral-50',
                    ].join(' ')}
                  >
                    <span aria-hidden="true">{meta.flag}</span>
                    {meta.label}
                    {loc === current && (
                      <svg
                        className="ms-auto w-3.5 h-3.5 text-primary-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
