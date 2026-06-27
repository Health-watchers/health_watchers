'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { StellarAddressDisplay } from '@/components/ui/StellarAddressDisplay';
import { PaymentReceipt } from '@/components/payments/PaymentReceipt';
import { ConfirmPaymentModal } from '@/components/payments/ConfirmPaymentModal';
import { API_URL } from '@/lib/api';
import { fetchWithAuth } from '@/lib/auth';

export interface Payment {
  id: string;
  intentId?: string;
  patientId: string;
  amount: string;
  asset?: string;
  assetCode?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'failed' | string;
  txHash?: string;
  confirmedAt?: string;
  createdAt?: string;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'completed' | 'failed';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'failed', label: 'Failed' },
];

/** Animated dot indicator for real-time status feedback */
function StatusIndicator({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" aria-hidden="true" />
        <Badge variant="warning">pending</Badge>
      </span>
    );
  }
  if (status === "confirmed" || status === "completed") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
        <Badge variant="success">{status}</Badge>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
        <Badge variant="danger">failed</Badge>
      </span>
    );
  }
  return <Badge variant="default">{status}</Badge>;
}

const DISPUTES_URL = `${API_URL}/api/v1/payments/disputes`;

interface Props {
  payments: Payment[];
  network?: string;
  /** Called when user confirms a payment; should throw on failure */
  onConfirm: (paymentId: string, txHash: string) => Promise<void>;
}

export function PaymentTable({ payments, network = 'testnet', onConfirm }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<string | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<Payment | null>(null);
  const [disputeTarget, setDisputeTarget] = useState<Payment | null>(null);
  const [disputeReason, setDisputeReason] = useState<'duplicate_payment' | 'service_not_rendered' | 'incorrect_amount' | 'other'>('service_not_rendered');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);

  const filtered = payments.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (dateFrom && p.createdAt && p.createdAt < dateFrom) return false;
    if (dateTo && p.createdAt && p.createdAt > dateTo + 'T23:59:59') return false;
    return true;
  });

  const buildTimeline = (payment: Payment) => {
    const timeline = [] as Array<{ label: string; detail: string; date?: string; link?: string }>;
    if (payment.createdAt) {
      timeline.push({ label: 'Created', detail: 'Payment intent recorded', date: payment.createdAt });
    }
    if (payment.txHash) {
      timeline.push({
        label: 'Transaction submitted',
        detail: `Stellar transaction ${payment.txHash.slice(0, 12)}…`,
        link: `https://stellar.expert/explorer/${network}/tx/${payment.txHash}`,
      });
    }
    if (payment.status === 'pending') {
      timeline.push({ label: 'Awaiting confirmation', detail: 'Transaction is pending on the network' });
    }
    if (payment.status === 'confirmed' || payment.status === 'completed') {
      timeline.push({
        label: 'Confirmed',
        detail: 'Payment is confirmed and settled',
        date: payment.confirmedAt ?? payment.createdAt,
      });
    }
    if (payment.status === 'failed') {
      timeline.push({ label: 'Failed', detail: 'Payment failed. Review details or file a dispute.' });
    }
    return timeline;
  };

  const canOpenReceipt = (payment: Payment) => Boolean(payment.intentId || payment.txHash);

  const openDispute = (payment: Payment) => {
    setDisputeTarget(payment);
    setDisputeReason('service_not_rendered');
    setDisputeDescription('');
    setDisputeMessage(null);
  };

  const submitDispute = async () => {
    if (!disputeTarget) return;
    setDisputeSubmitting(true);
    setDisputeMessage(null);
    try {
      const res = await fetchWithAuth(DISPUTES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: disputeTarget.intentId ?? disputeTarget.id,
          patientId: disputeTarget.patientId,
          reason: disputeReason,
          description: disputeDescription,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to file dispute (${res.status})`);
      }
      setDisputeMessage('Dispute filed successfully.');
    } catch (error) {
      setDisputeMessage(error instanceof Error ? error.message : 'Unable to file dispute');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="date-from" className="text-xs whitespace-nowrap text-neutral-500">
            From
          </label>
          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="focus:ring-primary-500 rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 focus:ring-2 focus:outline-none"
          />
          <label htmlFor="date-to" className="text-xs text-neutral-500">
            To
          </label>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="focus:ring-primary-500 rounded-md border border-neutral-200 px-2 py-1 text-sm text-neutral-700 focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                ID
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                Patient
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                Amount
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                Transaction
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                Date
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium tracking-wide text-neutral-500 uppercase"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No payments match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-neutral-50">
                  <td
                    className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-neutral-600"
                    title={p.id}
                  >
                    {p.id.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{p.patientId}</td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {p.amount}{' '}
                    <span className="font-normal text-neutral-500">{p.asset ?? 'XLM'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusIndicator status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    {p.txHash ? (
                      <StellarAddressDisplay value={p.txHash} type="tx" network={network} />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-neutral-500">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setTimelineTarget(p)}>
                        Timeline
                      </Button>
                      {canOpenReceipt(p) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReceiptTarget(p.intentId ?? p.id)}
                        >
                          Receipt
                        </Button>
                      )}
                      {p.status !== 'pending' && (
                        <Button size="sm" variant="secondary" onClick={() => openDispute(p)}>
                          File dispute
                        </Button>
                      )}
                      {p.status === 'pending' && (
                        <Button size="sm" variant="primary" onClick={() => setConfirmTarget(p.id)}>
                          Confirm
                        </Button>
                      )}
                      {p.txHash && (
                        <a
                          href={`https://stellar.expert/explorer/${network}/tx/${p.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-500 hover:bg-primary-50 focus-visible:ring-primary-500 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
                        >
                          View on Explorer
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm modal */}
      {receiptTarget && (
        <Modal open={Boolean(receiptTarget)} onClose={() => setReceiptTarget(null)} title="Payment Receipt">
          <PaymentReceipt intentId={receiptTarget} onClose={() => setReceiptTarget(null)} />
        </Modal>
      )}

      {timelineTarget && (
        <Modal
          open={Boolean(timelineTarget)}
          onClose={() => setTimelineTarget(null)}
          title="Payment status timeline"
        >
          <div className="space-y-4">
            {buildTimeline(timelineTarget).map((item) => (
              <div key={item.label} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-sm font-semibold text-neutral-800">{item.label}</p>
                <p className="text-sm text-neutral-600">{item.detail}</p>
                {item.date && <p className="text-xs text-neutral-500">{new Date(item.date).toLocaleString()}</p>}
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:underline text-xs"
                  >
                    View transaction
                  </a>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {disputeTarget && (
        <Modal
          open={Boolean(disputeTarget)}
          onClose={() => setDisputeTarget(null)}
          title="File a dispute"
        >
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              File a dispute for payment <span className="font-mono">{disputeTarget.id.slice(0, 14)}…</span>.
            </p>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700">Reason</label>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value as any)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <option value="duplicate_payment">Duplicate payment</option>
                <option value="service_not_rendered">Service not rendered</option>
                <option value="incorrect_amount">Incorrect amount</option>
                <option value="other">Other</option>
              </select>
              <label className="block text-sm font-medium text-neutral-700">Description</label>
              <textarea
                value={disputeDescription}
                onChange={(e) => setDisputeDescription(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm"
                placeholder="Explain why this payment should be disputed"
              />
            </div>
            {disputeMessage && (
              <p className={`text-sm ${disputeMessage.includes('Failed') ? 'text-danger-600' : 'text-success-600'}`}>
                {disputeMessage}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setDisputeTarget(null)} disabled={disputeSubmitting}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={submitDispute}
                disabled={disputeSubmitting || !disputeDescription.trim()}
                loading={disputeSubmitting}
              >
                Submit dispute
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {confirmTarget && (
        <ConfirmPaymentModal
          open={Boolean(confirmTarget)}
          onClose={() => setConfirmTarget(null)}
          paymentId={confirmTarget}
          onConfirm={async (id, txHash) => {
            await onConfirm(id, txHash);
            setConfirmTarget(null);
          }}
        />
      )}
    </div>
  );
}
