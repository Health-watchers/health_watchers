'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePendingSync, OfflineSync, type PendingForm } from '@/lib/offline-sync';
import {
  getConflicts,
  resolveConflict,
  resolveConflictManual,
  type ConflictData,
} from '@/lib/pwa/conflict-resolution';
import { Badge, Button } from '@/components/ui';

// ─── helpers ────────────────────────────────────────────────────────────────

function friendlyLabel(form: PendingForm): string {
  if (form.label) return form.label;
  if (form.url.includes('/patients')) return 'Patient Registration';
  if (form.url.includes('/encounters')) return 'Encounter Creation';
  return `${form.method} ${form.url}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

// ─── ConflictResolver sub-component ─────────────────────────────────────────

function ConflictResolver({
  conflict,
  onResolved,
}: {
  conflict: ConflictData;
  onResolved: () => void;
}) {
  const [resolving, setResolving] = useState(false);

  const handleResolve = async (strategy: 'local' | 'remote') => {
    setResolving(true);
    try {
      const resolved = resolveConflict(conflict, strategy);
      await resolveConflictManual(conflict.id, resolved);
      onResolved();
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/10"
      role="alert"
      aria-label="Conflict detected"
      data-testid="conflict-resolver"
    >
      <p className="mb-1 text-xs font-semibold text-red-800 dark:text-red-300">
        Sync conflict detected
      </p>
      <p className="mb-3 text-xs text-red-700 dark:text-red-400">
        The server data changed while you were offline. Choose which version to keep.
      </p>
      <div className="flex gap-2">
        <button
          disabled={resolving}
          onClick={() => handleResolve('local')}
          className="rounded bg-white px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-50"
        >
          Keep my changes
        </button>
        <button
          disabled={resolving}
          onClick={() => handleResolve('remote')}
          className="rounded bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
        >
          Use server version
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function SyncQueueStatus() {
  const { pendingCount, isSyncing, isOnline } = usePendingSync();
  const [showDetails, setShowDetails] = useState(false);
  const [pendingForms, setPendingForms] = useState<PendingForm[]>([]);
  const [conflicts, setConflicts] = useState<ConflictData[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPendingForms = useCallback(async () => {
    setLoading(true);
    try {
      const [forms, unresolvedConflicts] = await Promise.all([
        OfflineSync.getPendingForms(),
        getConflicts(),
      ]);
      setPendingForms(forms);
      setConflicts(unresolvedConflicts);
    } catch (err) {
      console.error('Failed to load pending forms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDetails) {
      loadPendingForms();
    }
  }, [showDetails, pendingCount, loadPendingForms]);

  // Also reload conflicts whenever we come back online
  useEffect(() => {
    if (isOnline) {
      getConflicts()
        .then(setConflicts)
        .catch(() => {});
    }
  }, [isOnline]);

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

  const hasConflicts = conflicts.length > 0;
  const hasActivity = pendingCount > 0 || isSyncing || hasConflicts;

  if (!hasActivity) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 shadow dark:border-neutral-700 dark:bg-neutral-800"
      data-testid="sync-queue-status"
      aria-live="polite"
    >
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-neutral-100">Sync Status</h3>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-neutral-400">
            {isSyncing ? (
              <>
                Syncing {pendingCount} pending change
                {pendingCount !== 1 ? 's' : ''}…
              </>
            ) : hasConflicts ? (
              <span className="text-red-600 dark:text-red-400">
                {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} need
                {conflicts.length === 1 ? 's' : ''} attention
              </span>
            ) : pendingCount > 0 ? (
              <>
                {pendingCount} pending change{pendingCount !== 1 ? 's' : ''} waiting to sync
              </>
            ) : (
              <>Syncing changes…</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasConflicts && (
            <Badge variant="danger" className="text-xs">
              {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {pendingCount > 0 && !isSyncing && isOnline && (
            <Button size="sm" onClick={handleRetrySync}>
              Retry Sync
            </Button>
          )}
          {(pendingCount > 0 || hasConflicts) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
            >
              {showDetails ? 'Hide' : 'Details'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Expandable details ───────────────────────────────────────────── */}
      {showDetails && (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-neutral-700">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">Loading…</p>
          ) : (
            <>
              {/* Conflicts */}
              {conflicts.map((c) => (
                <ConflictResolver key={c.id} conflict={c} onResolved={loadPendingForms} />
              ))}

              {/* Pending forms list */}
              {pendingForms.length > 0 ? (
                <>
                  <ul className="space-y-2" aria-label="Pending sync items">
                    {pendingForms.map((form) => (
                      <li
                        key={form.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-neutral-700"
                        data-testid="sync-queue-item"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-neutral-100">
                            {friendlyLabel(form)}
                          </p>
                          <p className="truncate text-xs text-gray-500 dark:text-neutral-400">
                            {form.url}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-neutral-500">
                            {timeAgo(form.timestamp)}
                          </p>
                        </div>
                        {isSyncing && (
                          <Badge variant="warning" className="ml-3 shrink-0 text-xs">
                            Syncing
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>

                  {!isSyncing && (
                    <button
                      onClick={handleClearPending}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Clear all pending changes
                    </button>
                  )}
                </>
              ) : (
                !hasConflicts && (
                  <p className="text-sm text-gray-500 dark:text-neutral-400">No pending changes</p>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
