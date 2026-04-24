import { API_URL } from '@/lib/api';

export async function portalFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_URL}/api/v1/portal${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
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
