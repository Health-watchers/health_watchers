'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Syncs the persisted theme preference from the backend into next-themes on mount.
 * Renders nothing — purely a side-effect component.
 */
export function ThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    fetch('/api/settings/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const theme = data?.data?.preferences?.theme;
        if (theme === 'light' || theme === 'dark' || theme === 'system') {
          setTheme(theme);
        }
      })
      .catch(() => {
        // silently ignore — default theme from next-themes will be used
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
