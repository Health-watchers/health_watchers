'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface Clinic {
  _id: string;
  name: string;
  isActive?: boolean;
}

/**
 * Clinic switcher for SUPER_ADMIN users. Lets a platform admin scope their
 * session to a different clinic without logging out — the backend issues a new
 * access token scoped to the selected clinic (see POST /auth/switch-clinic).
 * Renders nothing for non-super-admins.
 */
export default function ClinicSwitcher() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    fetch('/api/clinics', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.data) setClinics(json.data as Clinic[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const handleSwitch = useCallback(async (clinicId: string) => {
    if (!clinicId) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/switch-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clinicId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message ?? 'Failed to switch clinic');
      }
      // Reload so AuthContext re-fetches the profile with the new clinic scope.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch clinic');
      setSwitching(false);
    }
  }, []);

  if (!isSuperAdmin || clinics.length === 0) return null;

  return (
    <div className="flex items-center gap-2" title="Switch active clinic">
      <label htmlFor="clinic-switcher" className="sr-only">
        Switch clinic
      </label>
      <svg
        className="h-4 w-4 text-neutral-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5"
        />
      </svg>
      <select
        id="clinic-switcher"
        className="focus:ring-primary-500 max-w-[12rem] rounded-md border border-neutral-200 bg-neutral-0 px-2 py-1 text-sm text-neutral-700 focus:ring-2 focus:outline-none disabled:opacity-50"
        value={user?.clinicId ?? ''}
        disabled={switching}
        onChange={(e) => handleSwitch(e.target.value)}
        aria-label="Switch active clinic"
      >
        {/* Current clinic may not be in the list if it was deactivated; show a fallback. */}
        {!clinics.some((c) => c._id === user?.clinicId) && user?.clinicId && (
          <option value={user.clinicId}>{user.clinicName ?? 'Current clinic'}</option>
        )}
        {clinics.map((clinic) => (
          <option key={clinic._id} value={clinic._id}>
            {clinic.name}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
