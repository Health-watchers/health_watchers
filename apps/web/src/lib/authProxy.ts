import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { webConfig } from '@/lib/config';

/**
 * Forward a request to the API with the httpOnly access-token cookie as a Bearer token.
 * Used by the Next.js route handlers that the browser calls (it cannot read the cookie).
 */
export async function proxyWithAuth(
  request: NextRequest,
  path: string,
  init: { method: string; body?: unknown } = { method: 'GET' }
): Promise<NextResponse> {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_URL}/api/v1${path}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Set the auth cookies from a successful token response (login, MFA, passkey sign-in). */
export function setAuthCookies(
  response: NextResponse,
  tokens: { accessToken: string; refreshToken: string }
): void {
  response.cookies.set('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: webConfig.isProd(),
    sameSite: 'lax',
    maxAge: 15 * 60, // 15 minutes
    path: '/',
  });

  response.cookies.set('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: webConfig.isProd(),
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}
