'use client';

import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  /** Custom fallback. Receives the error and a reset callback. A plain node is also accepted. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Human-readable name of the section this boundary protects (used in Sentry tags + copy). */
  name?: string;
  onError?: (error: Error, errorInfo: { componentStack: string }) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorId: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    this.reportError(error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: { componentStack: string }) {
    // Report to Sentry with the generated error ID so support can correlate it
    // with what the user sees on screen.
    Sentry.withScope((scope) => {
      scope.setTag('errorId', this.state.errorId);
      if (this.props.name) scope.setTag('errorBoundary', this.props.name);
      scope.setContext('react', { componentStack: errorInfo.componentStack });
      Sentry.captureException(error);
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: '' });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(this.state.error, this.handleReset);
      }
      return (
        fallback ?? (
          <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
            <div className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-lg">
              <div className="flex justify-center text-5xl" aria-hidden="true">
                ⚠️
              </div>
              <h2 className="text-center text-xl font-bold text-neutral-900">
                Something went wrong
              </h2>
              <p className="text-center text-sm text-neutral-600">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <div className="rounded-md bg-neutral-50 p-3 font-mono text-xs text-neutral-500 break-all">
                Error ID: {this.state.errorId}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={this.handleReset} variant="primary" size="md" className="w-full">
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
              <p className="text-center text-xs text-neutral-500">
                If the problem persists, contact support with Error ID: {this.state.errorId}
              </p>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
