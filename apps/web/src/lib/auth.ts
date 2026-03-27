const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
    // Ignore errors during logout
  }
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let res = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  // If 401, try to refresh token and retry once
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await fetch(url, {
        ...options,
        credentials: 'include',
      });
    } else {
      // Redirect to login if refresh fails
      await logout();
      window.location.href = '/login';
    }
  }

  return res;
}
