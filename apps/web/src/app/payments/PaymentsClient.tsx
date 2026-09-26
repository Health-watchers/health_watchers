'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  ErrorMessage,
  Toast,
  SlideOver,
  PageWrapper,
  PageHeader,
  SectionErrorBoundary,
} from '@/components/ui';
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

function getPaymentsErrorMessage(
  error: unknown,
  messages: { loadError: string; networkError: string }
): string {
  if (!(error instanceof Error)) return messages.loadError;
  if (error.message.includes('Failed to fetch')) return messages.networkError;
  if (error.message.startsWith('Request failed')) return messages.loadError;
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
  const t = useTranslations('payments');
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
        setToast({ message: t('confirmed'), type: 'success' });
      } else if (prev === 'pending' && p.status === 'failed') {
        setToast({ message: t('failedToast'), type: 'error' });
      }
      prevStatuses.current[p.id] = p.status;
    });
  }, [polledPayments, t]);

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
    setToast({ message: t('created'), type: 'success' });
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
    setToast({ message: t('confirmed'), type: 'success' });
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() });
  };

  const displayPayments = polling ? polledPayments : payments;

  return (
    <PageWrapper className="py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="mb-6 flex items-center justify-between">
        <PageHeader title={t('title')} />
        <div className="flex items-center gap-3">
          {polling && (
            <span className="flex items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs text-yellow-700">
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-yellow-400"
                aria-hidden="true"
              />
              {t('polling')}
            </span>
          )}
          <Button variant="outline" onClick={() => (window.location.href = '/invoices')}>
            {t('invoices')}
          </Button>
          <PaymentExportButton onError={(msg) => setToast({ message: msg, type: 'error' })} />
          <Button onClick={() => setShowForm(true)}>{t('newPayment')}</Button>
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
          <span>{t('loading')}</span>
        </div>
      )}

      {error && (
        <ErrorMessage
          message={getPaymentsErrorMessage(error, {
            loadError: t('loadError'),
            networkError: t('networkError'),
          })}
          onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.payments.list() })}
        />
      )}

      {!isLoading && !error && (
        <SectionErrorBoundary name="payment panel">
          <PaymentTable payments={displayPayments} network={NETWORK} onConfirm={handleConfirm} />
        </SectionErrorBoundary>
      )}

      <SlideOver isOpen={showForm} onClose={() => setShowForm(false)} title={t('newPaymentIntent')}>
        <PaymentIntentForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </SlideOver>
    </PageWrapper>
  );
}
