'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useOnlineStatus } from '@/lib/offline-sync';

interface StaleDataIndicatorProps {
  /** ISO timestamp or epoch ms of when the data was last fetched/cached */
  cachedAt?: string | number;
  /** Custom label shown next to the indicator; defaults to generic message */
  label?: string;
  /** Hide after going back online and data has likely refreshed (default: true) */
  hideWhenOnline?: boolean;
  className?: string;
}

/**
 * Shows a subtle badge when the displayed data may be stale because
 * the user was (or still is) offline during the last fetch.
 *
 * Usage:
 *   <StaleDataIndicator cachedAt={patient.updatedAt} label="Patient data" />
 */
export function StaleDataIndicator({
  cachedAt,
  label = 'Data',
  hideWhenOnline = true,
  className = '',
}: StaleDataIndicatorProps) {
  const isOnline = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);

  // Track if the user ever went offline during this session
  useEffect(() => {
    if (!isOnline) setWasOffline(true);
  }, [isOnline]);

  // Compute age string — must be called before any conditional return
  const ageStr = useMemo(() => {
    if (!cachedAt) return null;
    const ts = typeof cachedAt === 'string' ? Date.parse(cachedAt) : cachedAt;
    if (isNaN(ts)) return null;
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }, [cachedAt]);

  // Only show while offline (or when hideWhenOnline=false and user was offline)
  const shouldShow = !isOnline || (!hideWhenOnline && wasOffline);
  if (!shouldShow) return null;

  return (
    <span
      role="status"
      aria-label={`${label} may be stale${ageStr ? `, last updated ${ageStr}` : ''}`}
      title={`${label} may be stale — you are viewing cached data`}
      className={[
        'inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800',
        'dark:bg-amber-900/30 dark:text-amber-300',
        className,
      ].join(' ')}
      data-testid="stale-data-indicator"
    >
      {/* Clock icon */}
      <svg
        className="h-3 w-3 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2" />
      </svg>
      {ageStr ? `Cached ${ageStr}` : 'Cached data'}
    </span>
  );
}
