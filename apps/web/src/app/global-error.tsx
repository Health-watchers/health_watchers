'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for the App Router. This catches errors thrown in the
 * root layout itself (which the per-segment `error.tsx` cannot), so the app
 * never falls back to the browser's default white-screen crash. It must render
 * its own <html>/<body> because it replaces the root layout when active.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 font-sans antialiased">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-lg sm:p-8">
            <div className="text-5xl" aria-hidden="true">
              ⚠️
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">Something went wrong</h1>
            <p className="text-neutral-600">
              {error.message || 'A critical error occurred. Please try again.'}
            </p>
            {error.digest && (
              <div className="rounded-md bg-neutral-50 p-3 font-mono text-xs break-all text-neutral-500">
                Request ID: {error.digest}
              </div>
            )}
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={reset}
                className="bg-primary-600 hover:bg-primary-700 w-full rounded-md px-4 py-2 font-medium text-white transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full rounded-md border border-neutral-300 px-4 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Go Home
              </button>
            </div>
            <p className="pt-2 text-xs text-neutral-500">
              If the problem persists, please contact support.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
