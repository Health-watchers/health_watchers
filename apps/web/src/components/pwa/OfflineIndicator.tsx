'use client';

import { useEffect, useState } from 'react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [showSyncStatus, setShowSyncStatus] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-orange-300 bg-orange-50 p-4 shadow-lg dark:border-orange-900/50 dark:bg-orange-900/20">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-orange-900 dark:text-orange-100">You are offline</p>
          <p className="text-sm text-orange-800 dark:text-orange-200">
            Changes will be synced when you're back online. Core features remain available.
          </p>
        </div>
        <button
          onClick={() => setShowSyncStatus(!showSyncStatus)}
          className="shrink-0 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          {showSyncStatus ? 'Hide' : 'Details'}
        </button>
      </div>

      {showSyncStatus && (
        <div className="mt-3 border-t border-orange-200 pt-3 text-xs text-orange-800 dark:border-orange-900/50 dark:text-orange-200">
          <p>Pending changes will be automatically synced when connectivity is restored.</p>
        </div>
      )}
    </div>
  );
}
