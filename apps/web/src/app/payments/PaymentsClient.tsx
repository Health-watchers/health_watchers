'use client';

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ErrorMessage,
  Toast,
  SlideOver,
  PageWrapper,
  PageHeader,
} from "@/components/ui";
import { PaymentTable, type Payment } from "@/components/payments/PaymentTable";
import {
  PaymentIntentForm,
  type PaymentIntentData,
} from "@/components/forms/PaymentIntentForm";
import { Button } from "@/components/ui/Button";
import { queryKeys } from "@/lib/queryKeys";
import { API_URL } from "@/lib/api";

const API = `${API_URL}/api/v1`;
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet";
const POLL_INTERVAL_MS = 5000;

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

function usePayments(pollingEnabled: boolean) {
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.list(),
    queryFn: async () => {
      const res = await fetch(`${API}/payments`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data ?? data ?? [];
    },
    refetchInterval: pollingEnabled ? POLL_INTERVAL_MS : false,
  });
}

/** Returns true if any payment in the list is still pending */
function hasPendingPayments(payments: Payment[]): boolean {
  return payments.some((p) => p.status === 'pending');
}

export default function PaymentsClient() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: payments = [], isLoading, error } = usePayments(hasPendingPayments([]));

  // Enable polling whenever there are pending payments
  const polling = hasPendingPayments(payments);
  const { data: polledPayments = payments, isLoading: pollingLoading } = usePayments(polling);

  // Track previous statuses to show toast on transition
  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    polledPayments.forEach((p) => {
      const prev = prevStatuses.current[p.id];
      if (prev === 'pending' && p.status === 'confirmed') {
        setToast({ message: `Payment confirmed.`, type: 'success' });
      } else if (prev === 'pending' && p.status === 'failed') {
        setToast({ message: `Payment failed.`, type: 'error' });
      }
      prevStatuses.current[p.id] = p.status;
    });
  }, [polledPayments]);

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

  const handleConfirm = async (intentId: string, txHash: string) => {
    const res = await fetch(`${API}/payments/${intentId}/confirm`, {
      method: 'PATCH',
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

  const displayPayments = polling ? polledPayments : payments;

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Payments" />
        <div className="flex items-center gap-3">
          {polling && (
            <span className="flex items-center gap-1.5 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" aria-hidden="true" />
              Polling for updates…
            </span>
          )}
          <Button onClick={() => setShowForm(true)}>+ New Payment</Button>
        </div>
      </div>

      {(isLoading || pollingLoading) && !displayPayments.length && (
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
            queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() })
          }
        />
      )}

      {!isLoading && !error && (
        <PaymentTable payments={displayPayments} network={NETWORK} onConfirm={handleConfirm} />
      )}

      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title="New Payment Intent">
        <PaymentIntentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </SlideOver>
    </PageWrapper>
  );
}
