'use client';

import { useCallback, useState } from 'react';
import * as Sentry from '@sentry/nextjs';

interface UseAsyncErrorOptions {
  maxRetries?: number;
  retryDelay?: number;
  onError?: (error: Error) => void;
  onRetry?: (attempt: number) => void;
}

interface AsyncErrorState {
  error: Error | null;
  isLoading: boolean;
  isRetrying: boolean;
  retryCount: number;
}

export function useAsyncError(options: UseAsyncErrorOptions = {}) {
  const { maxRetries = 3, retryDelay = 1000, onError, onRetry } = options;

  const [state, setState] = useState<AsyncErrorState>({
    error: null,
    isLoading: false,
    isRetrying: false,
    retryCount: 0,
  });

  const execute = useCallback(
    async <T>(
      asyncFn: () => Promise<T>,
      shouldRetry?: (error: Error, attempt: number) => boolean
    ): Promise<T | null> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt < maxRetries) {
        try {
          const result = await asyncFn();
          setState((prev) => ({ ...prev, isLoading: false, retryCount: 0 }));
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          attempt++;

          const canRetry =
            attempt < maxRetries && (!shouldRetry || shouldRetry(lastError, attempt));

          if (canRetry) {
            setState((prev) => ({
              ...prev,
              isRetrying: true,
              retryCount: attempt,
            }));

            onRetry?.(attempt);

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
          } else {
            break;
          }
        }
      }

      // All retries exhausted
      if (lastError) {
        Sentry.captureException(lastError, {
          contexts: {
            retry: {
              attempts: attempt,
              maxRetries,
            },
          },
        });

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRetrying: false,
          error: lastError,
          retryCount: attempt,
        }));

        onError?.(lastError);
      }

      return null;
    },
    [maxRetries, retryDelay, onError, onRetry]
  );

  const reset = useCallback(() => {
    setState({
      error: null,
      isLoading: false,
      isRetrying: false,
      retryCount: 0,
    });
  }, []);

  const retry = useCallback(
    async <T>(asyncFn: () => Promise<T>) => {
      return execute(asyncFn);
    },
    [execute]
  );

  return {
    ...state,
    execute,
    reset,
    retry,
  };
}
