'use client';

import React from 'react';
import { useOnlineStatus } from '@/lib/offline-sync';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 left-4 z-50 rounded-lg border border-yellow-200 bg-yellow-50 p-4 shadow-lg md:right-4 md:left-auto md:w-80">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-800">You are offline</h3>
          <p className="mt-1 text-xs text-yellow-700">
            You can still view cached patient data. Changes will sync when you're back online.
          </p>
        </div>
      </div>
    </div>
  );
}
