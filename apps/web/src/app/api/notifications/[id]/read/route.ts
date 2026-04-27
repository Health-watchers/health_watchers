import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const res = await fetch(`${API_URL}/api/v1/notifications/${params.id}/read`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
