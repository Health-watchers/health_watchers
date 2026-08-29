'use client';

import React, { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { webConfig } from '@/lib/config';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry
    const errorId = Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    });

    this.setState({
      errorInfo,
      errorId: errorId as string,
    });

    // Call optional callback
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (webConfig.isDev()) {
      console.error('Error caught by boundary:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorId={this.state.errorId}
          onReset={this.handleReset}
          showDetails={this.props.showDetails}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string | null;
  onReset: () => void;
  showDetails?: boolean;
}

export function ErrorFallback({
  error,
  errorInfo,
  errorId,
  onReset,
  showDetails = webConfig.isDev(),
}: ErrorFallbackProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white shadow-lg dark:border-red-800 dark:bg-gray-800">
        <div className="border-b border-red-200 bg-red-50 px-6 py-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            <h1 className="text-xl font-semibold text-red-900 dark:text-red-100">
              Oops! Something went wrong
            </h1>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            We're sorry for the inconvenience. An unexpected error has occurred and our team has
            been notified. Please try again or contact support if the problem persists.
          </p>

          {errorId && (
            <div className="mb-4 rounded-lg bg-gray-100 p-3 dark:bg-gray-700">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-semibold">Error ID:</span>
              </p>
              <p className="font-mono text-xs text-gray-900 dark:text-gray-100 break-all">
                {errorId}
              </p>
            </div>
          )}

          {showDetails && error && (
            <details className="mb-4 rounded-lg bg-gray-100 dark:bg-gray-700">
              <summary className="cursor-pointer px-3 py-2 font-semibold text-gray-900 dark:text-gray-100">
                Error Details
              </summary>
              <div className="border-t border-gray-300 px-3 py-2 dark:border-gray-600">
                <p className="mb-2 font-mono text-xs text-red-600 dark:text-red-400">
                  {error.message}
                </p>
                {errorInfo && (
                  <pre className="overflow-x-auto rounded bg-gray-800 p-2 text-xs text-gray-100">
                    {errorInfo.componentStack}
                  </pre>
                )}
              </div>
            </details>
          )}

          <div className="mt-4 space-y-2">
            <button
              onClick={onReset}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <a
              href="/"
              className="flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-800"
            >
              Go Home
            </a>
          </div>

          {webConfig.app.supportEmail && (
            <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
              Need help?{' '}
              <a
                href={`mailto:${webConfig.app.supportEmail}`}
                className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Contact support
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook to throw errors within components
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  if (error) {
    throw error;
  }

  const handleError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    setError(err);
  };

  const resetError = () => {
    setError(null);
  };

  return { handleError, resetError };
}
