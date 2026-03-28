'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorMessage, Toast, SlideOver, PageWrapper, PageHeader } from '@/components/ui';
import { PaymentTable, type Payment } from '@/components/payments/PaymentTable';
import { PaymentIntentForm, type PaymentIntentData } from '@/components/forms/PaymentIntentForm';
import { Button } from '@/components/ui/Button';
import { queryKeys } from '@/lib/queryKeys';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';

function getPaymentsErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Unable to load payments right now.';
  if (error.message.includes('Failed to fetch')) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }
  if (error.message.startsWith('Request failed')) {
    return 'Unable to load payments right now. Please try again.';
  }
  return error.message;
}

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
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 py-8 text-neutral-500"
        >
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700"
            aria-hidden="true"
          />
          <span>Loading payments...</span>
        </div>
      )}

      {error && (
        <ErrorMessage
          message={getPaymentsErrorMessage(error)}
          onRetry={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.payments.list(),
            })
          }
        />
      )}

      {!isLoading && !error && payments.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-neutral-900">No records found</h2>
          <p className="mt-2 text-sm text-neutral-600">
            No payments found. Create a new payment to get started.
          </p>
          <Button className="mt-5" onClick={() => setShowForm(true)}>
            + New Payment
          </Button>
        </div>
      )}

      {!isLoading && !error && payments.length > 0 && (
        <PaymentTable payments={payments} network={NETWORK} onConfirm={handleConfirm} />
      )}

      {/* Create Payment Intent slide-over */}
      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title="New Payment Intent">
        <PaymentIntentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </SlideOver>
    </PageWrapper>
  );
}
