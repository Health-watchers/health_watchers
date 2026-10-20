'use client';

import { useCallback } from 'react';
import { toast } from '@/components/ui/Toast';

/**
 * useApiError — returns a stable `handleError` callback that extracts a
 * human-readable message from various error shapes and shows a toast.
 *
 * @example
 * const handleError = useApiError();
 * useEffect(() => { if (error) handleError(error); }, [error, handleError]);
 */
export function useApiError(fallbackMessage = 'An unexpected error occurred.') {
  const handleError = useCallback(
    (err: unknown) => {
      let message = fallbackMessage;
      if (err instanceof Error) {
        message = err.message || fallbackMessage;
      } else if (typeof err === 'string') {
        message = err;
      } else if (
        typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
      ) {
        message = (err as { message: string }).message;
      }
      toast.error(message);
    },
    [fallbackMessage]
  );

  return handleError;
}
