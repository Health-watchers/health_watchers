'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ErrorMessage,
  Toast,
  SlideOver,
  PageWrapper,
  PageHeader,
  SectionErrorBoundary,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { RecurringPaymentsPanel } from '@/components/payments/RecurringPaymentsPanel';
import { BatchPaymentsPanel } from '@/components/payments/BatchPaymentsPanel';
import { PaymentTable, type Payment } from '@/components/payments/PaymentTable';
import { PaymentIntentForm, type PaymentIntentData } from '@/components/forms/PaymentIntentForm';
import { Button } from '@/components/ui/Button';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_URL } from '@/lib/api';
import { PaymentExportButton } from '@/components/payments/PaymentExportButton';

const API = `${API_URL}/api/v1`;
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
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

type PaymentsTab = 'payments' | 'recurring' | 'batch';
const TABS: PaymentsTab[] = ['payments', 'recurring', 'batch'];

export default function PaymentsClient() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<PaymentsTab>('payments');

  // Deep link: /payments?tab=recurring | batch
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab') as PaymentsTab;
    if (TABS.includes(requested)) setTab(requested);
  }, []);

  const changeTab = (next: string) => {
    const value = TABS.includes(next as PaymentsTab) ? (next as PaymentsTab) : 'payments';
    setTab(value);
    const url = new URL(window.location.href);
    if (value === 'payments') url.searchParams.delete('tab');
    else url.searchParams.set('tab', value);
    window.history.replaceState(null, '', url);
  };
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
    const body: any = {
      patientId: data.patientId,
      amount: data.amount,
      assetCode: data.asset,
      memo: data.memo,
      feeStrategy: data.feeStrategy,
    };
    if (data.sourceAssetCode) {
      body.sourceAssetCode = data.sourceAssetCode;
      body.sourceAssetIssuer = data.sourceAssetIssuer;
    }
    if (data.destinationAmount) body.destinationAmount = data.destinationAmount;
    if (data.maxSourceAmount) body.maxSourceAmount = data.maxSourceAmount;
    if (data.path) body.path = data.path;

    const res = await fetchWithAuth(`${API}/payments/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    const res = await fetchWithAuth(`${API}/payments/${paymentId}/confirm`, {
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

      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Payments" />
        <div className="flex items-center gap-3">
          {polling && (
            <span className="flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs text-yellow-700">
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-yellow-400"
                aria-hidden="true"
              />
              Polling for updates…
            </span>
          )}
          <Button variant="outline" onClick={() => (window.location.href = '/invoices')}>
            Invoices
          </Button>
          <PaymentExportButton onError={(msg) => setToast({ message: msg, type: 'error' })} />
          <Button onClick={() => setShowForm(true)}>+ New Payment</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="batch">Batch</TabsTrigger>
        </TabsList>

        <TabsContent value="recurring">
          <SectionErrorBoundary name="recurring payments">
            <RecurringPaymentsPanel />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="batch">
          <SectionErrorBoundary name="batch payments">
            <BatchPaymentsPanel />
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="payments">
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
              onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() })}
            />
          )}

          {!isLoading && !error && (
            <SectionErrorBoundary name="payment panel">
              <PaymentTable payments={displayPayments} network={NETWORK} onConfirm={handleConfirm} />
            </SectionErrorBoundary>
          )}
        </TabsContent>
      </Tabs>

      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title="New Payment Intent">
        <PaymentIntentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </SlideOver>
    </PageWrapper>
  );
}
