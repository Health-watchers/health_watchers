'use client';

import { type ReactNode } from 'react';
import { ErrorBoundary } from './error-boundary';
import { Button } from './Button';

interface SectionErrorBoundaryProps {
  /** Name of the protected section — shown in the fallback copy and tagged in Sentry. */
  name: string;
  children: ReactNode;
}

/**
 * Wraps a single page section (e.g. the patient list, an encounter form, the
 * payment panel) so a render error in that section is contained: the rest of the
 * page stays interactive and the user gets a compact, retryable error card
 * instead of a white screen. Errors are reported to Sentry by the underlying
 * ErrorBoundary.
 */
export function SectionErrorBoundary({ name, children }: SectionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      name={name}
      fallback={(error, reset) => (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center"
        >
          <div className="text-3xl" aria-hidden="true">
            ⚠️
          </div>
          <p className="text-sm font-semibold text-red-900">
            This section couldn’t be displayed
          </p>
          <p className="text-xs text-red-700">
            {error.message || `The ${name} failed to load.`}
          </p>
          <Button onClick={reset} variant="secondary" size="sm">
            Retry
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
