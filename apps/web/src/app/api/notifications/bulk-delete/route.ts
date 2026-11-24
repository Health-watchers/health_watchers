import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

/**
 * POST /api/notifications/bulk-delete
 *
 * Body: { ids: string[] }
 *
 * Proxies to the Express API at POST /api/v1/notifications/bulk-delete.
 * Responds with 400 if `ids` is missing or empty.
 */
export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids } = body as { ids?: unknown };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: 'ids must be a non-empty array of notification IDs' },
      { status: 400 }
    );
  }

  // Ensure every element is a non-empty string to guard against injection
  const safeIds: string[] = ids.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  if (safeIds.length === 0) {
    return NextResponse.json({ error: 'No valid notification IDs provided' }, { status: 400 });
  }

  const res = await fetch(`${API_URL}/api/v1/notifications/bulk-delete`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: safeIds }),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
