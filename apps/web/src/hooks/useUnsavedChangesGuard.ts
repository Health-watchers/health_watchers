'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface UnsavedChangesGuard {
  /** Whether the confirmation modal should be shown. */
  showModal: boolean;
  /** Call when the user confirms they want to leave. Navigates to the pending URL. */
  confirmLeave: () => void;
  /** Call when the user cancels and wants to stay on the page. */
  cancelLeave: () => void;
  /** The URL the user was trying to navigate to, or null if triggered by tab close. */
  pendingUrl: string | null;
  /**
   * Wrap your router.push / router.replace calls with this instead.
   * If the form is dirty it will open the confirmation modal instead of
   * navigating immediately; if clean it navigates straight through.
   *
   * Example:
   *   const { guardedPush } = useUnsavedChangesGuard(isDirty);
   *   <button onClick={() => guardedPush('/patients')}>Cancel</button>
   */
  guardedPush: (href: string) => void;
}

const DEFAULT_MESSAGE =
  'You have unsaved changes. Are you sure you want to leave this page?';

/**
 * Protects a form page from accidental navigation when there are unsaved changes.
 *
 * - Registers a `beforeunload` handler so the browser shows a native prompt when
 *   the user closes the tab or does a hard refresh.
 * - Exposes modal state (`showModal`, `confirmLeave`, `cancelLeave`, `pendingUrl`)
 *   so the caller can render a custom <UnsavedChangesModal> for in-app navigation.
 * - Provides a `guardedPush` helper to intercept `router.push` calls.
 *
 * @param isDirty  Whether the form has unsaved changes.
 * @param message  Optional custom message passed to the `beforeunload` event.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  message: string = DEFAULT_MESSAGE
): UnsavedChangesGuard {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // Keep a ref so the confirmLeave callback always sees the latest pendingUrl
  // without needing it as a dependency (avoids re-creating the callback).
  const pendingUrlRef = useRef<string | null>(null);
  pendingUrlRef.current = pendingUrl;

  // ── beforeunload (tab close / hard refresh) ──────────────────────────────
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy support: setting returnValue triggers the browser dialog.
      // Modern browsers ignore the string but require a non-empty value.
      e.returnValue = message;
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, message]);

  // ── In-app navigation helpers ────────────────────────────────────────────

  const guardedPush = useCallback(
    (href: string) => {
      if (!isDirty) {
        router.push(href);
        return;
      }
      setPendingUrl(href);
      setShowModal(true);
    },
    [isDirty, router]
  );

  const confirmLeave = useCallback(() => {
    const url = pendingUrlRef.current;
    setShowModal(false);
    setPendingUrl(null);
    if (url) {
      router.push(url);
    }
  }, [router]);

  const cancelLeave = useCallback(() => {
    setShowModal(false);
    setPendingUrl(null);
  }, []);

  return { showModal, confirmLeave, cancelLeave, pendingUrl, guardedPush };
}
