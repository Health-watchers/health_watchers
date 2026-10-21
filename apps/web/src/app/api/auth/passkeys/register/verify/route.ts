import { NextRequest } from 'next/server';
import { proxyWithAuth } from '@/lib/authProxy';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return proxyWithAuth(request, '/auth/passkeys/register/verify', { method: 'POST', body });
}
