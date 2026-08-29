'use client';

import { useState } from 'react';
import { Calendar, DollarSign, Clock } from 'lucide-react';

interface EscrowPaymentFormProps {
  encounterId?: string;
  patientId?: string;
  onSuccess?: (data: any) => void;
}

export function EscrowPaymentForm({ encounterId, patientId, onSuccess }: EscrowPaymentFormProps) {
  const [amount, setAmount] = useState('');
  const [claimableAfter, setClaimableAfter] = useState('');
  const [claimableUntil, setClaimableUntil] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/v1/payments/claimable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          claimableAfter,
          claimableUntil,
          encounterId,
          patientId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create escrow payment');
      }

      onSuccess?.(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold">Create Escrow Payment</h3>
        <p className="mb-6 text-sm text-gray-600">
          Funds will be held in escrow and can only be claimed by the clinic after the service date.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          <DollarSign className="mr-1 inline h-4 w-4" />
          Amount (XLM)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          placeholder="100.00"
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          <Calendar className="mr-1 inline h-4 w-4" />
          Claimable After (Service Date)
        </label>
        <input
          type="datetime-local"
          value={claimableAfter}
          onChange={(e) => setClaimableAfter(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          required
        />
        <p className="mt-1 text-xs text-gray-500">Clinic can claim funds after this date</p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          <Clock className="mr-1 inline h-4 w-4" />
          Claimable Until (Expiry Date)
        </label>
        <input
          type="datetime-local"
          value={claimableUntil}
          onChange={(e) => setClaimableUntil(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Funds return to patient after this date if not claimed
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-[44px] w-full rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading ? 'Creating Escrow...' : 'Create Escrow Payment'}
      </button>
    </form>
  );
}
