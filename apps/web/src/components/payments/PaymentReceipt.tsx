'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';

interface ReceiptData {
  receiptUrl: string;
  receiptNumber: string;
  generatedAt: string;
}

interface PaymentReceiptProps {
  intentId: string;
  onClose?: () => void;
}

export function PaymentReceipt({ intentId, onClose }: PaymentReceiptProps) {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        const response = await fetch(`/api/v1/payments/${intentId}/receipt`);
        if (!response.ok) {
          if (response.status === 404) {
            setError('Receipt not yet generated for this payment');
          } else {
            throw new Error('Failed to fetch receipt');
          }
        } else {
          const data = await response.json();
          setReceipt(data.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [intentId]);

  const downloadReceipt = async () => {
    if (!receipt?.receiptUrl) return;
    try {
      const response = await fetch(receipt.receiptUrl);
      if (!response.ok) throw new Error('Failed to download receipt');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${receipt.receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download');
    }
  };

  const emailReceipt = async () => {
    try {
      const response = await fetch(`/api/v1/payments/${intentId}/receipt/email`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to email receipt');
      alert('Receipt sent to patient email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to email receipt');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        {error}
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        No receipt available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm font-semibold text-neutral-900">Receipt #{receipt.receiptNumber}</p>
        <p className="text-xs text-neutral-600">
          Generated: {new Date(receipt.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={downloadReceipt} variant="primary" size="md" className="w-full">
          Download Receipt
        </Button>
        <Button onClick={emailReceipt} variant="secondary" size="md" className="w-full">
          Email Receipt
        </Button>
        {onClose && (
          <Button onClick={onClose} variant="secondary" size="md" className="w-full">
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
