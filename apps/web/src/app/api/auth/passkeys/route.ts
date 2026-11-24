import { NextRequest } from 'next/server';
import { proxyWithAuth } from '@/lib/authProxy';

// GET /api/auth/passkeys — list the signed-in user's passkeys
export async function GET(request: NextRequest) {
  return proxyWithAuth(request, '/auth/passkeys');
}
