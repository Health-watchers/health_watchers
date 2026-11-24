'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

const THEME_STORAGE_KEY = 'theme';
const VALID_THEMES = ['light', 'dark', 'system'] as const;
type ValidTheme = (typeof VALID_THEMES)[number];

function isValidTheme(value: unknown): value is ValidTheme {
  return typeof value === 'string' && (VALID_THEMES as readonly string[]).includes(value);
}

/**
 * Syncs the persisted theme preference from the backend into next-themes on mount.
 * Renders nothing — purely a side-effect component.
 *
 * Persistence strategy:
 * - next-themes already persists the selected theme to localStorage under the
 *   `theme` key (configurable via `storageKey` on the provider). We explicitly
 *   read/write that key here so the preference survives across sessions even if
 *   the backend is unreachable, and so a backend preference takes precedence
 *   only when the user has no local override.
 */
export function ThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    // Read any locally persisted preference first so we can decide precedence.
    let localTheme: string | null = null;
    try {
      localTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable (e.g. privacy mode) — ignore.
    }

    fetch('/api/settings/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const theme = data?.data?.preferences?.theme;
        if (isValidTheme(theme)) {
          // Backend preference wins when present, and we persist it locally so
          // it survives across sessions even before the next fetch resolves.
          setTheme(theme);
          try {
            window.localStorage.setItem(THEME_STORAGE_KEY, theme);
          } catch {
            // ignore storage failures
          }
        } else if (isValidTheme(localTheme)) {
          // No backend preference — fall back to the locally persisted theme.
          setTheme(localTheme);
        }
      })
      .catch(() => {
        // Backend unreachable — restore the locally persisted theme if any so
        // the user's preference persists across sessions.
        if (isValidTheme(localTheme)) {
          setTheme(localTheme);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
</｜｜DSML｜｜ parameter>