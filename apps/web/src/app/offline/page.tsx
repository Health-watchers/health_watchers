'use client';

import { useEffect, useState } from 'react';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(() => window.location.href = '/', 1000);
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
  }, []);

  if (isOnline) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-50 px-4 dark:bg-green-900/10">
        <div className="text-center">
          <div className="mb-4 inline-block rounded-full bg-green-100 p-4 dark:bg-green-900/30">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-green-900 dark:text-green-100">
            Back Online!
          </h1>
          <p className="text-green-800 dark:text-green-200">Reconnecting you...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-block rounded-full bg-orange-100 p-4 dark:bg-orange-900/30">
          <svg
            className="h-8 w-8 text-orange-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.111 16.332a9 9 0 11-4.08-15.993m9.861 1.02A9.014 9.014 0 003.5 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-4.97-4.03-9-9-9z"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          You're Offline
        </h1>

        <p className="mb-6 text-neutral-600 dark:text-neutral-400">
          You've lost your internet connection, but your changes are safe and will sync automatically
          when you're back online.
        </p>

        <div className="mb-8 space-y-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-left dark:border-orange-900/30 dark:bg-orange-900/10">
          <h2 className="font-semibold text-orange-900 dark:text-orange-100">What you can do:</h2>
          <ul className="space-y-2 text-sm text-orange-800 dark:text-orange-200">
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-600"></span>
              <span>View cached pages and data you've already accessed</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-600"></span>
              <span>Make changes which will sync when you're back online</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-600"></span>
              <span>Continue using core features offline</span>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => (window.location.href = '/')}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            Go to Home
          </button>

          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            <span className="inline-block h-2 w-2 rounded-full bg-orange-500 animate-pulse align-middle mr-2"></span>
            Monitoring connection... You'll be redirected when online
          </p>
        </div>
      </div>
    </div>
  );
}
