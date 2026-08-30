'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Optional fallback shown while the auth state is being resolved */
  fallback?: React.ReactNode;
}

/**
 * Client-side guard that redirects to /login when the user is not authenticated.
 *
 * The Next.js middleware already handles server-side redirects for most cases.
 * This component provides an additional client-side check for pages that are
 * rendered after hydration (e.g. when the cookie expires mid-session).
 */
export function ProtectedRoute({ children, fallback = null }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center"
      >
        <span
          className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-primary-500"
          aria-hidden="true"
        />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!user) {
    // Render fallback (or nothing) while the redirect is in flight
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
