import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({ status: 'authenticated' });
}
