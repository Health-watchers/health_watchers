import { NextRequest, NextResponse } from 'next/server';

/**
 * Hands the (short-lived) access token to same-origin client code so it can authenticate the
 * Socket.IO handshake — the cookie itself is httpOnly and the socket connects cross-origin to
 * the API. Never cached.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(
    { token: accessToken },
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
