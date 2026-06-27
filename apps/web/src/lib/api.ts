import { ApiErrorCode } from '@health-watchers/types';

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn('⚠️ NEXT_PUBLIC_API_URL is not set. API calls may fail.');
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// Normalised /api/v1 base — handles trailing slashes and already-versioned URLs
export const API_V1 = API_URL.endsWith('/api/v1')
  ? API_URL
  : `${API_URL.replace(/\/$/, '')}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode | string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;

  // Read CSRF token from cookie for state-changing requests
  const csrfToken = typeof document !== 'undefined'
    ? document.cookie.split('; ').find(r => r.startsWith('csrf-token='))?.split('=')[1]
    : undefined;

  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(
    (options.method ?? 'GET').toUpperCase()
  );

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(isMutation && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    let code: ApiErrorCode | string = String(response.status);
    let message = `API error: ${response.status}`;
    try {
      const body = await response.json();
      code = body.code ?? code;
      message = body.message ?? message;
    } catch {
      // ignore parse error
    }
    throw new ApiError(response.status, code, message);
  }

  return response.json();
}
