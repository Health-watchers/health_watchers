'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

export interface ConfirmPaymentModalProps {
  open: boolean;
  onClose: () => void;
  paymentId: string;
  /** Called with the tx hash; should throw on failure */
  onConfirm: (paymentId: string, txHash: string) => Promise<void>;
}

type State = 'idle' | 'loading' | 'success' | 'error';

export function ConfirmPaymentModal({
  open,
  onClose,
  paymentId,
  onConfirm,
}: ConfirmPaymentModalProps) {
  const [txHash, setTxHash] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleClose = () => {
    if (state === 'loading') return;
    setTxHash('');
    setState('idle');
    setErrorMsg('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash.trim()) return;
    setState('loading');
    setErrorMsg('');
    try {
      await onConfirm(paymentId, txHash.trim());
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Confirmation failed.');
      setState('error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Confirm Payment"
      description="Enter the Stellar transaction hash to confirm this payment."
      size="sm"
    >
      {state === 'success' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="bg-success-50 flex h-12 w-12 items-center justify-center rounded-full">
            <svg
              className="text-success-500 h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-neutral-800">Payment confirmed</p>
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Transaction Hash"
            placeholder="e.g. a1b2c3d4…"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            disabled={state === 'loading'}
            required
          />

          {state === 'error' && (
            <p role="alert" className="text-danger-500 text-xs">
              {errorMsg}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={handleClose}
              disabled={state === 'loading'}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={!txHash.trim() || state === 'loading'}
              loading={state === 'loading'}
            >
              {state === 'loading' ? 'Confirming…' : 'Confirm'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
