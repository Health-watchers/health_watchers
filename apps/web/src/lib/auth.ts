/**
 * Client-side auth utilities.
 *
 * Tokens are stored exclusively in httpOnly cookies managed by the Next.js
 * API routes (/api/auth/*). These helpers work with those cookies via
 * `credentials: 'include'`.
 */

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // ignore
  }
}

/**
 * Wraps `fetch` with automatic token refresh on 401.
 * On a second 401 (refresh failed), clears cookies and redirects to /login.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let res = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(url, {
        ...options,
        credentials: 'include',
      });
    } else {
      await logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  return res;
}
