'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useUnsavedChangesGuard — intercepts page navigation (beforeunload) and
 * internal route changes to warn the user when they have unsaved changes.
 *
 * When `isDirty` is true:
 *  - `beforeunload` event is intercepted to show the browser's native confirm dialog.
 *  - `showModal` becomes true whenever a `routechange` custom event fires.
 *
 * The parent component renders an `UnsavedChangesModal` and calls
 * `confirmLeave` (to proceed) or `cancelLeave` (to stay).
 */
export function useUnsavedChangesGuard(isDirty: boolean, message: string) {
  const [showModal, setShowModal] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // ── beforeunload — native browser dialog ───────────────────────────────────
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, message]);

  // ── Internal route change interception ─────────────────────────────────────
  // Listen for custom 'routechange' events dispatched by Next.js navigation wrappers
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const path = detail?.path as string | undefined;
      setPendingPath(path ?? null);
      setShowModal(true);
    };

    window.addEventListener('routechange', handler);
    return () => window.removeEventListener('routechange', handler);
  }, [isDirty]);

  const confirmLeave = useCallback(() => {
    setShowModal(false);
    setPendingPath(null);
    // Allow navigation to proceed by dispatching a "confirmed-leave" event
    window.dispatchEvent(new CustomEvent('confirmed-leave', { detail: { path: pendingPath } }));
  }, [pendingPath]);

  const cancelLeave = useCallback(() => {
    setShowModal(false);
    setPendingPath(null);
    window.dispatchEvent(new CustomEvent('cancelled-leave'));
  }, []);

  return { showModal, confirmLeave, cancelLeave };
}
