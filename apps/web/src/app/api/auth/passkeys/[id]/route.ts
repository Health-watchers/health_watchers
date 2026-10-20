import { NextRequest } from 'next/server';
import { proxyWithAuth } from '@/lib/authProxy';

// PATCH /api/auth/passkeys/:id — rename
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  return proxyWithAuth(request, `/auth/passkeys/${encodeURIComponent(params.id)}`, {
    method: 'PATCH',
    body,
  });
}

// DELETE /api/auth/passkeys/:id — remove
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return proxyWithAuth(request, `/auth/passkeys/${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
  });
}
