const baseUrl = process.env.NEXT_PUBLIC_API_URL;

if (!baseUrl) {
  console.warn(
    "[api] NEXT_PUBLIC_API_URL is not set. API calls may fail in non-local environments."
  );
}

export async function apiFetch(path: string, options?: RequestInit): Promise<unknown> {
  const url = `${baseUrl ?? ""}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  return res.json();
}
