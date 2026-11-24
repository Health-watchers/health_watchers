'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui';
import { AlertCircle } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppointmentsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-danger-50 p-4 dark:bg-danger-900/20">
            <AlertCircle className="h-12 w-12 text-danger-600 dark:text-danger-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Failed to load appointments
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          {error.message || 'An error occurred while loading appointments. Please try again.'}
        </p>
        {error.digest && (
          <p className="rounded-md bg-neutral-100 p-2 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="primary">
            Try Again
          </Button>
          <Button href="/dashboard" variant="secondary">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
