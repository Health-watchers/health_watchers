'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/auth';
import { truncateId } from '@/lib/utils';

type DisputeReason =
  | 'duplicate_payment'
  | 'service_not_rendered'
  | 'incorrect_amount'
  | 'other';

interface DisputeModalProps {
  open: boolean;
  onClose: () => void;
  /** The payment to dispute */
  payment: {
    id: string;
    intentId?: string;
    patientId: string;
  };
  /** API endpoint for submitting disputes */
  disputesUrl: string;
}

/**
 * Self-contained modal for filing a payment dispute.
 * Extracted from PaymentTable to keep dispute state and submission isolated.
 */
export function DisputeModal({ open, onClose, payment, disputesUrl }: DisputeModalProps) {
  const [reason, setReason] = useState<DisputeReason>('service_not_rendered');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClose = () => {
    setReason('service_not_rendered');
    setDescription('');
    setMessage(null);
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetchWithAuth(disputesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: payment.intentId ?? payment.id,
          patientId: payment.patientId,
          reason,
          description,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to file dispute (${res.status})`);
      }

      setMessage('Dispute filed successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to file dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const isError = Boolean(message && !message.includes('successfully'));

  return (
    <Modal open={open} onClose={handleClose} title="File a dispute">
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          File a dispute for payment{' '}
          <span className="font-mono">{truncateId(payment.id, 14)}</span>.
        </p>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="dispute-reason"
              className="block text-sm font-medium text-neutral-700"
            >
              Reason
            </label>
            <select
              id="dispute-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as DisputeReason)}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
            >
              <option value="duplicate_payment">Duplicate payment</option>
              <option value="service_not_rendered">Service not rendered</option>
              <option value="incorrect_amount">Incorrect amount</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="dispute-description"
              className="block text-sm font-medium text-neutral-700"
            >
              Description
            </label>
            <textarea
              id="dispute-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              placeholder="Explain why this payment should be disputed"
            />
          </div>
        </div>

        {message && (
          <p
            className={`text-sm font-medium ${isError ? 'text-danger-600' : 'text-success-600'}`}
          >
            {message}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting || !description.trim()}
            loading={submitting}
          >
            Submit dispute
          </Button>
        </div>
      </div>
    </Modal>
  );
}
