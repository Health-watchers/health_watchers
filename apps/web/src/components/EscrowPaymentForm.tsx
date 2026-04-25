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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div>
        <h3 className="text-lg font-semibold mb-4">Create Escrow Payment</h3>
        <p className="text-sm text-gray-600 mb-6">
          Funds will be held in escrow and can only be claimed by the clinic after the service date.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <DollarSign className="inline w-4 h-4 mr-1" />
          Amount (XLM)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
          placeholder="100.00"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Calendar className="inline w-4 h-4 mr-1" />
          Claimable After (Service Date)
        </label>
        <input
          type="datetime-local"
          value={claimableAfter}
          onChange={(e) => setClaimableAfter(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Clinic can claim funds after this date
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Clock className="inline w-4 h-4 mr-1" />
          Claimable Until (Expiry Date)
        </label>
        <input
          type="datetime-local"
          value={claimableUntil}
          onChange={(e) => setClaimableUntil(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Funds return to patient after this date if not claimed
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors min-h-[44px]"
      >
        {loading ? 'Creating Escrow...' : 'Create Escrow Payment'}
      </button>
    </form>
  );
}
