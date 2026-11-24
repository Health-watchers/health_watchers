import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

// Unauthenticated — the user has no session yet (or only an MFA temp token)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${API_URL}/api/v1/auth/passkeys/login/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
