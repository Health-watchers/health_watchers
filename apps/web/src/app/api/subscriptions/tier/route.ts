import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

export async function PUT(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const res = await fetch(`${API_URL}/api/v1/subscriptions/me/tier`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
