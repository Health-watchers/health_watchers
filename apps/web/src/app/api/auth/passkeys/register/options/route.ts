import { NextRequest } from 'next/server';
import { proxyWithAuth } from '@/lib/authProxy';

export async function POST(request: NextRequest) {
  return proxyWithAuth(request, '/auth/passkeys/register/options', { method: 'POST' });
}
