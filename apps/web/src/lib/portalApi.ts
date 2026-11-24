import { API_URL } from '@/lib/api';

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((r) => r.startsWith('csrf-token='))
    ?.split('=')[1];
}

export async function portalFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const token = method !== 'GET' && method !== 'HEAD' ? csrfToken() : undefined;
  const res = await fetch(`${API_URL}/api/v1/portal${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-CSRF-Token': token } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    window.location.href = '/portal/login';
  }

  return res;
}

export async function portalGet<T>(endpoint: string): Promise<T> {
  const res = await portalFetch(endpoint);
  if (!res.ok) throw new Error(`Portal API error: ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

/** Portal mutation that resolves to the full response body and throws with the API's message. */
export async function portalSend<T = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const res = await portalFetch(endpoint, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? `Portal API error: ${res.status}`);
  return json;
}
