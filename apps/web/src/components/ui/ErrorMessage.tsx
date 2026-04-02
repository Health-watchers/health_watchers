"use client";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className="rounded-md bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-600 flex items-center justify-between gap-4"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-xs font-medium underline hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
