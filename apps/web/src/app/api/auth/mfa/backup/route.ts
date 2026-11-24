import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { setAuthCookies } from '@/lib/authProxy';

// POST /api/auth/mfa/backup — complete the MFA step with a single-use backup code
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${API_URL}/api/v1/auth/mfa/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const response = NextResponse.json(data);
    setAuthCookies(response, data.data);
    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
