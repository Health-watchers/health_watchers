import { NextRequest } from 'next/server';
import { proxyWithAuth } from '@/lib/authProxy';

// GET /api/auth/session-policy — the clinic's idle timeout for automatic logoff
export async function GET(request: NextRequest) {
  return proxyWithAuth(request, '/auth/session-policy');
}
