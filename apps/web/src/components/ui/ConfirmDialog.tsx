'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  /** Controls visibility of the dialog */
  open: boolean;
  /** Called when the user dismisses the dialog (Escape, backdrop click, Cancel button) */
  onClose: () => void;
  /** Called when the user confirms the action. If async, the dialog stays in a loading state until it resolves/rejects. */
  onConfirm: () => void | Promise<void>;
  /** Dialog title (required for accessibility — used as the dialog label) */
  title: string;
  /** Body message explaining the consequence of the action */
  message: ReactNode;
  /** Label for the confirm button (defaults to "Confirm") */
  confirmLabel?: string;
  /** Label for the cancel button (defaults to "Cancel") */
  cancelLabel?: string;
  /**
   * When set, the user must type this exact string into a text field before the
   * confirm button is enabled. Used for permanent / destructive deletions.
   */
  requireTextMatch?: string;
  /** Optional helper text shown above the text-match input */
  matchPrompt?: string;
  /** When true, the confirm button shows a spinner and is disabled */
  loading?: boolean;
}

const DEFAULT_CONFIRM_LABEL = 'Confirm';
const DEFAULT_CANCEL_LABEL = 'Cancel';

/**
 * Reusable confirmation dialog for destructive actions.
 *
 * - Builds on the accessible Modal primitive (focus trapping, Escape, scroll lock)
 *   but is self-contained so it can be used without wrapping it in <Modal>.
 * - When `requireTextMatch` is provided, the user must type the exact string
 *   (e.g. the patient's full name) before the confirm button becomes enabled.
 *   This guards against accidental permanent deletions.
 * - Animations are pure CSS (fade + scale) so no extra dependencies are needed.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = DEFAULT_CONFIRM_LABEL,
  cancelLabel = DEFAULT_CANCEL_LABEL,
  requireTextMatch,
  matchPrompt,
  loading = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const requiresMatch = typeof requireTextMatch === 'string' && requireTextMatch.length > 0;
  const isMatched = !requiresMatch || typed.trim() === requireTextMatch;
  const canConfirm = isMatched && !loading;

  // Reset the typed value whenever the dialog opens or the target changes
  useEffect(() => {
    if (open) setTyped('');
  }, [open, requireTextMatch]);

  // Focus management — focus the confirm button (or first input when text match is required)
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const focusTarget = requiresMatch
      ? containerRef.current?.querySelector('input')
      : confirmBtnRef.current;
    focusTarget?.focus();

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open, requiresMatch]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, loading]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Trap focus inside the dialog
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return;
      const focusable = containerRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {/* Animated backdrop */}
      <div
        className="confirm-dialog-backdrop absolute inset-0 bg-black/40"
        onClick={() => !loading && onClose()}
        aria-hidden="true"
      />

      {/* Animated panel */}
      <div
        ref={containerRef}
        className="confirm-dialog-panel relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800"
      >
        {/* Header */}
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
        >
          {title}
        </h2>

        {/* Message */}
        <div
          id="confirm-dialog-message"
          className="mt-2 text-sm text-neutral-600 dark:text-neutral-300"
        >
          {message}
        </div>

        {/* Typed-name confirmation (only for permanent deletions) */}
        {requiresMatch && (
          <div className="mt-4">
            <label
              htmlFor="confirm-dialog-match"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-200"
            >
              {matchPrompt ?? `Type "${requireTextMatch}" to confirm`}
            </label>
            <input
              id="confirm-dialog-match"
              type="text"
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) handleConfirm();
              }}
              disabled={loading}
              className="focus:border-primary-500 focus:ring-primary-500 mt-1.5 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm focus:ring-1 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder={requireTextMatch}
              aria-describedby="confirm-dialog-match-hint"
            />
            <p
              id="confirm-dialog-match-hint"
              className="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
            >
              This action cannot be undone.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="focus:ring-primary-500 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-danger-500 hover:bg-danger-600 focus:ring-danger-500 dark:bg-danger-600 dark:hover:bg-danger-700 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
