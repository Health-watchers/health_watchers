'use client';

import React from 'react';
import { usePendingSync } from '@/lib/offline-sync';
import { Spinner } from '@/components/ui';

export function OfflineIndicator() {
  const { isOnline, pendingCount, isSyncing } = usePendingSync();

  if (isOnline && !isSyncing) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 z-50 rounded-lg border p-4 shadow-lg md:left-auto md:right-4 md:w-80 ${
        isOnline ? 'border-blue-200 bg-blue-50' : 'border-yellow-200 bg-yellow-50'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {isSyncing ? (
            <Spinner className="h-5 w-5" />
          ) : (
            <svg
              className={`h-5 w-5 ${isOnline ? 'text-blue-600' : 'text-yellow-600'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div className="flex-1">
          {isSyncing ? (
            <>
              <h3
                className={`text-sm font-medium ${isOnline ? 'text-blue-800' : 'text-yellow-800'}`}
              >
                Syncing changes...
              </h3>
              <p className={`mt-1 text-xs ${isOnline ? 'text-blue-700' : 'text-yellow-700'}`}>
                {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'} being uploaded
              </p>
            </>
          ) : isOnline ? (
            <>
              <h3 className="text-sm font-medium text-blue-800">Back online</h3>
              <p className="mt-1 text-xs text-blue-700">
                {pendingCount > 0
                  ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} synced successfully`
                  : 'Your data is up to date'}
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-medium text-yellow-800">You are offline</h3>
              <p className="mt-1 text-xs text-yellow-700">
                {pendingCount > 0
                  ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync`
                  : 'You can still view cached data. Changes will sync when online.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
