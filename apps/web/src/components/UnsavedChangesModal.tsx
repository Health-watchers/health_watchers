'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export interface UnsavedChangesModalProps {
  /** Controls whether the modal is visible. */
  isOpen: boolean;
  /** Called when the user chooses to leave (discard changes). */
  onConfirm: () => void;
  /** Called when the user chooses to stay on the page. */
  onCancel: () => void;
}

/**
 * A confirmation dialog shown when the user tries to navigate away from a
 * form that has unsaved changes.
 *
 * Renders inside the shared <Modal> component so it inherits focus-trapping,
 * Escape-to-cancel, and ARIA dialog semantics.
 */
export function UnsavedChangesModal({ isOpen, onConfirm, onCancel }: UnsavedChangesModalProps) {
  return (
    <Modal
      open={isOpen}
      onClose={onCancel}
      title="Unsaved changes"
      description="You have unsaved changes that will be lost if you leave this page."
      size="sm"
    >
      {/* Warning icon + body text */}
      <div className="mb-6 flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100"
          aria-hidden="true"
        >
          <svg
            className="h-5 w-5 text-amber-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Any information you have entered will not be saved. Are you sure you want to leave?
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" size="md" onClick={onCancel}>
          Stay on page
        </Button>
        <Button variant="danger" size="md" onClick={onConfirm}>
          Leave page
        </Button>
      </div>
    </Modal>
  );
}
