'use client';

import { Modal } from '@/components/ui';

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable modal that warns users about unsaved changes before they navigate away.
 * Built on top of the accessible Modal primitive.
 */
export function UnsavedChangesModal({ isOpen, onConfirm, onCancel }: UnsavedChangesModalProps) {
  return (
    <Modal open={isOpen} onClose={onCancel} title="Unsaved changes" size="sm">
      <p className="text-sm text-neutral-600">
        You have unsaved SOAP notes that will be lost if you leave this page. Are you sure you want
        to continue?
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Stay and edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          Leave without saving
        </button>
      </div>
    </Modal>
  );
}
