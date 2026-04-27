'use client';

import { Button } from '@/components/ui';

export default function PaymentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
        <div className="flex justify-center text-5xl" aria-hidden="true">
          💳
        </div>
        <h1 className="text-center text-xl font-bold text-neutral-900">
          Failed to load payments
        </h1>
        <p className="text-center text-sm text-neutral-600">
          {error.message || 'Unable to load the payments list. Please try again.'}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={reset} variant="primary" size="md" className="w-full">
            Try Again
          </Button>
          <Button
            onClick={() => (window.location.href = '/')}
            variant="secondary"
            size="md"
            className="w-full"
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}
