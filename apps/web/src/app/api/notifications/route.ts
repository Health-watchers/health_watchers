import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();

  const res = await fetch(`${API_URL}/api/v1/notifications${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
