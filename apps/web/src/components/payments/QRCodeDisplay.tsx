'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

interface QRCodeDisplayProps {
  intentId: string;
  onClose?: () => void;
}

export function QRCodeDisplay({ intentId, onClose }: QRCodeDisplayProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [paymentURI, setPaymentURI] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQRCode = async () => {
      try {
        const response = await fetch(`/api/v1/payments/${intentId}/qr?format=data-url`);
        if (!response.ok) throw new Error('Failed to fetch QR code');
        const data = await response.json();
        setQrCode(data.data.qrCode);
        setPaymentURI(data.data.paymentURI);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchQRCode();
  }, [intentId]);

  const downloadQRCode = async () => {
    try {
      const response = await fetch(`/api/v1/payments/${intentId}/qr?format=png`);
      if (!response.ok) throw new Error('Failed to download QR code');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment-qr-${intentId}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download');
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

  return (
    <div className="space-y-4">
      {qrCode && (
        <div className="flex flex-col items-center gap-4">
          <img
            src={qrCode}
            alt="Payment QR Code"
            className="h-64 w-64 rounded-lg border-2 border-neutral-200"
          />
          <p className="text-center text-sm text-neutral-600">
            Scan with your Stellar wallet app to pay
          </p>
        </div>
      )}

      {paymentURI && (
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-600">Payment URI:</p>
          <p className="break-all font-mono text-xs text-neutral-700">{paymentURI}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button onClick={downloadQRCode} variant="primary" size="md" className="w-full">
          Download QR Code
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
