'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-32 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />;
  }

  const themes = [
    {
      value: 'light',
      label: '☀️ Light',
      description: 'Bright and clean interface',
    },
    {
      value: 'dark',
      label: '🌙 Dark',
      description: 'Easy on the eyes at night',
    },
    {
      value: 'system',
      label: '💻 System',
      description: 'Follow your device settings',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Appearance</h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Choose how the application looks
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {themes.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`theme-transition relative overflow-hidden rounded-lg border-2 p-4 text-left transition-all duration-300 ${
              theme === t.value
                ? 'border-primary-600 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                : 'hover:border-primary-300 border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-primary-700'
            }`}
          >
            {theme === t.value && (
              <div className="absolute inset-0 animate-pulse bg-primary-500/5" />
            )}
            <div className="relative">
              <p className="font-medium text-neutral-900 dark:text-neutral-50">{t.label}</p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{t.description}</p>
              {theme === t.value && (
                <div className="mt-2 inline-block rounded-full bg-primary-600 px-2 py-1 text-xs font-semibold text-white dark:bg-primary-500">
                  Active
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          <strong>Current theme:</strong> {resolvedTheme === 'light' ? 'Light mode' : 'Dark mode'}{' '}
          {theme === 'system' && '(System preference)'}
        </p>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Theme preference is automatically saved to your browser. Themes switch smoothly with
          animated transitions for a seamless experience.
        </p>
      </div>
    </div>
  );
}
