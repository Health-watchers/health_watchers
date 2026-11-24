import { fetchWithAuth } from './auth';
import { API_V1 } from './api';

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((r) => r.startsWith('csrf-token='))
    ?.split('=')[1];
}

/**
 * Authenticated JSON request against /api/v1 with token refresh and the CSRF double-submit
 * header on mutations. Resolves to the response body's `data` field; throws with the API's
 * error message on failure.
 */
export async function authJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const token = isMutation ? csrfToken() : undefined;

  const res = await fetchWithAuth(`${API_V1}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'X-CSRF-Token': token } : {}),
      ...(init.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.message ?? `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = body?.error ?? body?.code;
    throw err;
  }
  return body.data as T;
}
