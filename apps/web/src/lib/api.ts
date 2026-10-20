import { ApiErrorCode } from '@health-watchers/types';
import { webConfig } from './config';

if (!process.env.NEXT_PUBLIC_API_URL) {
  console.warn('⚠️ NEXT_PUBLIC_API_URL is not set. API calls may fail.');
}

export const API_URL = webConfig.api.url;

// Normalised /api/v1 base — handles trailing slashes and already-versioned URLs
export const API_V1 = API_URL.endsWith('/api/v1') ? API_URL : webConfig.api.v1BaseUrl;

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

export function apiFetch(endpoint: string, options: RequestInit = {}) {
  return requestJson(`${API_URL}${endpoint}`, options);
}

/** Like apiFetch, but relative to the normalised /api/v1 base (e.g. `/audit?limit=50`). */
export function apiV1Fetch(endpoint: string, options: RequestInit = {}) {
  return requestJson(`${API_V1}${endpoint}`, options);
}

/** CSRF header for state-changing requests made outside apiFetch (e.g. multipart uploads). */
export function csrfHeader(): Record<string, string> {
  const csrfToken =
    typeof document !== 'undefined'
      ? document.cookie
          .split('; ')
          .find((r) => r.startsWith('csrf-token='))
          ?.split('=')[1]
      : undefined;
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
}

async function requestJson(url: string, options: RequestInit) {
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(
    (options.method ?? 'GET').toUpperCase()
  );

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(isMutation ? csrfHeader() : {}),
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
