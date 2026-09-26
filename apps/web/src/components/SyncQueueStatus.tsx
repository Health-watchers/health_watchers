'use client';

import React, { useState, useEffect } from 'react';
import { usePendingSync, OfflineSync } from '@/lib/offline-sync';
import { Badge, Button } from '@/components/ui';

interface PendingForm {
  id: string;
  url: string;
  method: string;
  timestamp: number;
}

export function SyncQueueStatus() {
  const { pendingCount, isSyncing, isOnline } = usePendingSync();
  const [showDetails, setShowDetails] = useState(false);
  const [pendingForms, setPendingForms] = useState<PendingForm[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showDetails && pendingCount > 0) {
      loadPendingForms();
    }
  }, [showDetails, pendingCount]);

  const loadPendingForms = async () => {
    setLoading(true);
    try {
      const forms = await OfflineSync.getPendingForms();
      setPendingForms(forms);
    } catch (err) {
      console.error('Failed to load pending forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySync = async () => {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as any).sync.register('form-sync');
      } catch (err) {
        console.error('Failed to trigger sync:', err);
      }
    }
  };

  const handleClearPending = async () => {
    if (confirm('Are you sure you want to clear all pending changes? This cannot be undone.')) {
      try {
        await OfflineSync.clearAllPendingForms();
        setPendingForms([]);
      } catch (err) {
        console.error('Failed to clear pending forms:', err);
      }
    }
  };

  if (pendingCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Sync Status</h3>
          <p className="mt-1 text-sm text-gray-600">
            {isSyncing ? (
              <>
                Syncing {pendingCount} pending change{pendingCount !== 1 ? 's' : ''}...
              </>
            ) : pendingCount > 0 ? (
              <>
                {pendingCount} pending change{pendingCount !== 1 ? 's' : ''} waiting to sync
              </>
            ) : (
              <>All changes synced</>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {pendingCount > 0 && !isSyncing && isOnline && (
            <Button size="sm" onClick={handleRetrySync}>
              Retry Sync
            </Button>
          )}
          {pendingCount > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? 'Hide' : 'Details'}
            </Button>
          )}
        </div>
      </div>

      {showDetails && pendingCount > 0 && (
        <div className="mt-4 border-t pt-4">
          {loading ? (
            <p className="text-sm text-gray-600">Loading pending changes...</p>
          ) : pendingForms.length > 0 ? (
            <>
              <ul className="space-y-2">
                {pendingForms.map((form) => (
                  <li
                    key={form.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{form.method}</p>
                      <p className="truncate text-xs text-gray-600">{form.url}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(form.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {isSyncing && (
                      <Badge variant="warning" className="ml-2">
                        Syncing
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
              {pendingCount > 0 && !isSyncing && (
                <button
                  onClick={handleClearPending}
                  className="mt-3 text-xs text-red-600 hover:text-red-700"
                >
                  Clear all pending changes
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-600">No pending changes</p>
          )}
        </div>
      )}
    </div>
  );
}
