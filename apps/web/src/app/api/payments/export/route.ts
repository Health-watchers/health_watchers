import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const upstream = new URL(`${API_URL}/api/v1/payments/export`);
  searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  const res = await fetch(upstream.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('Content-Disposition') ?? 'attachment',
    },
  });
}
