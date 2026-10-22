'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ApiError, apiV1Fetch } from '@/lib/api';

/**
 * "This wasn't me" landing page for new-device / new-country sign-in alerts (#1497).
 * Confirming signs the account out everywhere; the user then resets their password.
 * Reachable whether or not the visitor is signed in (see middleware ALWAYS_PUBLIC).
 */
function NotMeContent() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const revoke = async () => {
    if (!token) return;
    setState('submitting');
    setError(null);
    try {
      await apiV1Fetch('/auth/login-alerts/revoke', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setState('done');
    } catch (err) {
      setState('error');
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <Card padding="lg" className="rounded-2xl shadow-lg">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <div className="bg-danger-100 flex h-12 w-12 items-center justify-center rounded-lg">
          <span className="text-2xl" aria-hidden="true">
            🛡️
          </span>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Secure your account
        </h1>
      </div>

      {!token ? (
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          This link is missing its security token. Open the link from your sign-in alert again.
        </p>
      ) : state === 'done' ? (
        <div className="space-y-4">
          <div
            role="status"
            className="border-success-200 bg-success-50 dark:border-success-900 dark:bg-success-900/30 rounded-lg border px-4 py-3"
          >
            <p className="text-success-900 dark:text-success-200 font-medium">
              All sessions have been signed out
            </p>
            <p className="text-success-700 dark:text-success-300 mt-1 text-sm">
              Anyone using your account has been signed out. Reset your password now so they
              can&apos;t sign back in.
            </p>
          </div>
          <Link
            href="/forgot-password"
            className="text-primary-600 block text-center text-sm font-medium hover:underline"
          >
            Reset your password →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            If you don&apos;t recognise a recent sign-in to your Health Watchers account, sign out
            every session now. You&apos;ll need to sign in again on all of your devices.
          </p>
          {error && (
            <p
              role="alert"
              className="border-danger-200 bg-danger-50 text-danger-700 rounded-lg border px-4 py-3 text-sm"
            >
              {error}
            </p>
          )}
          <Button
            variant="danger"
            className="w-full"
            onClick={revoke}
            disabled={state === 'submitting'}
          >
            {state === 'submitting' ? 'Signing out…' : "This wasn't me — sign out everywhere"}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function NotMePage() {
  return (
    <Suspense fallback={null}>
      <NotMeContent />
    </Suspense>
  );
}
