import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

/** POST /api/settings/avatar — proxy a multipart avatar upload to the Express API */
export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('accessToken')?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Forward the raw FormData body unchanged so multer can parse it
    const formData = await request.formData();
    const forwardForm = new FormData();
    const file = formData.get('avatar');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No avatar file provided' }, { status: 400 });
    }
    forwardForm.append('avatar', file, (file as File).name ?? 'avatar');

    const res = await fetch(`${API_URL}/api/v1/users/me/avatar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: forwardForm,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/settings/avatar — remove the current user's avatar */
export async function DELETE(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('accessToken')?.value;
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const res = await fetch(`${API_URL}/api/v1/users/me/avatar`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
