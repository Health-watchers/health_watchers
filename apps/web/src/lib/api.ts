if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn('⚠️ NEXT_PUBLIC_API_URL is not set. API calls may fail.');
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// Normalised /api/v1 base — handles trailing slashes and already-versioned URLs
export const API_V1 = API_URL.endsWith('/api/v1')
  ? API_URL
  : `${API_URL.replace(/\/$/, '')}/api/v1`;

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
