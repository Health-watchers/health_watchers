'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

/**
 * DangerZone — irreversible or high-risk account actions.
 * Currently exposes one action: deactivate account.
 *
 * Requires password confirmation so an attacker with an open session can't
 * trigger this without the user's credentials.
 */
export function DangerZone() {
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password to confirm.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/settings/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? 'Failed to deactivate account.');
      }

      // Sign out — account is now inactive
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Danger Zone
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          These actions are permanent and cannot be undone.
        </p>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-400">
              Deactivate account
            </h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-500">
              Your account will be disabled immediately. You will be signed out and will not be
              able to sign in again until an administrator reactivates your account.
            </p>
          </div>
          {!open && (
            <button
              type="button"
              data-testid="danger-deactivate-btn"
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-md border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-700 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Deactivate account
            </button>
          )}
        </div>

        {open && (
          <form
            onSubmit={handleDeactivate}
            className="mt-4 space-y-3 border-t border-red-200 pt-4 dark:border-red-800"
            aria-label="Confirm account deactivation"
          >
            <p className="text-sm font-medium text-red-800 dark:text-red-400">
              Enter your password to confirm
            </p>
            <input
              id="deactivate-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Your current password"
              disabled={loading}
              data-testid="danger-password-input"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
            />

            {error && (
              <p className="text-sm text-red-700 dark:text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                data-testid="danger-confirm-btn"
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
              >
                {loading ? 'Deactivating…' : 'Yes, deactivate my account'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setOpen(false);
                  setPassword('');
                  setError(null);
                }}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-60 dark:border-neutral-600 dark:text-neutral-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
