'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle } from 'lucide-react';

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
      <body className="min-h-screen bg-neutral-50 font-sans antialiased dark:bg-neutral-900">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-lg sm:p-8 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex justify-center">
              <div className="rounded-full bg-danger-50 p-4 dark:bg-danger-900/20">
                <AlertCircle className="h-12 w-12 text-danger-600 dark:text-danger-400" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              Something went wrong
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              {error.message || 'A critical error occurred. Please try again.'}
            </p>
            {error.digest && (
              <div className="break-all rounded-md bg-neutral-50 p-3 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                Request ID: {error.digest}
              </div>
            )}
            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={reset}
                className="w-full rounded-lg bg-primary-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:bg-primary-500 dark:hover:bg-primary-600"
              >
                Try Again
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                Go Home
              </button>
            </div>
            <p className="pt-2 text-xs text-neutral-500 dark:text-neutral-400">
              If the problem persists, please contact support.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
