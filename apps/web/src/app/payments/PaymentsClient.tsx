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

interface PaymentsLabels {
  title: string;
  newPayment: string;
  newPaymentIntent: string;
  loading: string;
  created: string;
  confirmed: string;
  noMatch: string;
  all: string;
  pending: string;
  completed: string;
  failed: string;
  from: string;
  to: string;
  id: string;
  patient: string;
  amount: string;
  status: string;
  transaction: string;
  date: string;
  actions: string;
  confirm: string;
  viewOnExplorer: string;
}

export default function PaymentsClient({ labels }: { labels: PaymentsLabels }) {
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
    setToast({ message: labels.created, type: 'success' });
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
    setToast({ message: labels.confirmed, type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() });
  };

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <PageHeader title={labels.title} />
        <Button onClick={() => setShowForm(true)}>{labels.newPayment}</Button>
      </div>

      {isLoading && (
        <p role="status" aria-live="polite" className="text-neutral-500 py-8">
          {labels.loading}
        </p>
      )}

      {error && (
        <ErrorMessage
          message={error instanceof Error ? error.message : labels.loading}
          onRetry={() =>
            queryClient.invalidateQueries({
              queryKey: queryKeys.payments.list(),
            })
          }
        />
      )}

      {!isLoading && !error && (
        <PaymentTable
          payments={payments}
          network={NETWORK}
          onConfirm={handleConfirm}
          labels={{
            noMatch: labels.noMatch,
            all: labels.all,
            pending: labels.pending,
            completed: labels.completed,
            failed: labels.failed,
            from: labels.from,
            to: labels.to,
            id: labels.id,
            patient: labels.patient,
            amount: labels.amount,
            status: labels.status,
            transaction: labels.transaction,
            date: labels.date,
            actions: labels.actions,
            confirm: labels.confirm,
            viewOnExplorer: labels.viewOnExplorer,
          }}
        />
      )}

      <SlideOver
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={labels.newPaymentIntent}
      >
        <PaymentIntentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </SlideOver>
    </PageWrapper>
  );
}
