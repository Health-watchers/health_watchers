'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage, Toast, SlideOver, PageWrapper, PageHeader } from '@/components/ui';
import { PaymentTable, type Payment } from '@/components/payments/PaymentTable';
import { PaymentIntentForm, type PaymentIntentData } from '@/components/forms/PaymentIntentForm';
import { Button } from '@/components/ui/Button';
import { queryKeys } from '@/lib/queryKeys';

import { API_BASE } from '@/lib/api';

const API = API_BASE;
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';

export default function PaymentsClient() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const {
    data: payments = [],
    isLoading,
    error,
  } = useQuery<Payment[]>({
    queryKey: queryKeys.payments.list(),
    queryFn: async () => {
      const res = await fetch(`${API}/payments`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data ?? data ?? [];
    },
  });

  const handleCreate = async (data: PaymentIntentData) => {
    const res = await fetch(`${API}/payments/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `Error ${res.status}`);
    }
    setShowForm(false);
    setToast({ message: 'Payment intent created.', type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() });
  };

  const handleConfirm = async (paymentId: string, txHash: string) => {
    const res = await fetch(`${API}/payments/${paymentId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `Error ${res.status}`);
    }
    setToast({ message: 'Payment confirmed.', type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() });
  };

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Payments" />
        <Button onClick={() => setShowForm(true)}>+ New Payment</Button>
      </div>

      {isLoading && (
        <p role="status" aria-live="polite" className="text-neutral-500 py-8">
          Loading payments…
        </p>
      )}

      {error && (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load payments.'}
          onRetry={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.payments.list(),
            })
          }
        />
      )}

      {!isLoading && !error && (
        <PaymentTable payments={payments} network={NETWORK} onConfirm={handleConfirm} />
      )}

      {/* Create Payment Intent slide-over */}
      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title="New Payment Intent">
        <PaymentIntentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </SlideOver>
    </PageWrapper>
  );
}
