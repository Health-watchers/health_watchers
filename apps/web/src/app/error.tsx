"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error("Error:", error);
  }, [error]);

  const requestId = error.digest || "UNKNOWN";

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-neutral-0 rounded-lg border border-neutral-200 shadow-lg p-6 sm:p-8 text-center space-y-4">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="text-5xl" aria-hidden="true">
            ⚠️
          </div>
        </div>

        {/* Error Title */}
        <h1 className="text-2xl font-bold text-neutral-900">
          Something went wrong
        </h1>

        {/* Error Description */}
        <p className="text-neutral-600">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>

        {/* Request ID */}
        <div className="bg-neutral-50 rounded-md p-3 text-xs font-mono text-neutral-500 break-all">
          Request ID: {requestId}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-2">
          <Button
            onClick={reset}
            variant="primary"
            size="md"
            className="w-full"
          >
            Try Again
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            variant="secondary"
            size="md"
            className="w-full"
          >
            Go Home
          </Button>
        </div>

        {/* Additional Help */}
        <p className="text-xs text-neutral-500 pt-2">
          If the problem persists, please contact support with the Request ID
          above.
        </p>
      </div>
    </div>
  );
}
