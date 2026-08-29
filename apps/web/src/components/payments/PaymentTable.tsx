'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StellarAddressDisplay } from '@/components/ui/StellarAddressDisplay';
import { PaymentReceipt } from '@/components/payments/PaymentReceipt';
import { ConfirmPaymentModal } from '@/components/payments/ConfirmPaymentModal';
import { PaymentFilters, type StatusFilter } from '@/components/payments/PaymentFilters';
import { PaymentTimeline } from '@/components/payments/PaymentTimeline';
import { DisputeModal } from '@/components/payments/DisputeModal';
import { API_URL } from '@/lib/api';
import {
  paymentStatusVariant,
  canShowReceipt,
  canFileDispute,
  formatDate,
  truncateId,
} from '@/lib/utils';

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

const DISPUTES_URL = `${API_URL}/api/v1/payments/disputes`;

/** Animated dot + badge indicator for real-time status feedback. */
function StatusIndicator({ status }: { status: string }) {
  const variant = paymentStatusVariant(status);

  const dotColor =
    status === 'pending'
      ? 'bg-yellow-400 animate-pulse'
      : status === 'confirmed' || status === 'completed'
        ? 'bg-green-500'
        : status === 'failed'
          ? 'bg-red-500'
          : 'bg-neutral-400';

  if (variant === 'default') return <Badge variant="default">{status}</Badge>;

  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} aria-hidden="true" />
      <Badge variant={variant}>{status}</Badge>
    </span>
  );
}

interface Props {
  payments: Payment[];
  network?: string;
  /** Called when the user confirms a payment; should throw on failure. */
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

  const filtered = payments.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (dateFrom && p.createdAt && p.createdAt < dateFrom) return false;
    if (dateTo && p.createdAt && p.createdAt > `${dateTo}T23:59:59`) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <PaymentFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              {['ID', 'Patient', 'Amount', 'Status', 'Transaction', 'Date', 'Actions'].map(
                (col) => (
                  <th
                    key={col}
                    scope="col"
                    className={`px-4 py-3 text-xs font-medium tracking-wide text-neutral-500 uppercase ${col === 'Actions' ? 'text-right' : 'text-left'}`}
                  >
                    {col}
                  </th>
                )
              )}
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
                    {truncateId(p.id)}
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
                    {p.createdAt ? formatDate(p.createdAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setTimelineTarget(p)}
                      >
                        Timeline
                      </Button>

                      {canShowReceipt(p) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReceiptTarget(p.intentId ?? p.id)}
                        >
                          Receipt
                        </Button>
                      )}

                      {canFileDispute(p.status) && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDisputeTarget(p)}
                        >
                          File dispute
                        </Button>
                      )}

                      {p.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setConfirmTarget(p.id)}
                        >
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

      {/* Receipt modal */}
      {receiptTarget && (
        <Modal
          open={Boolean(receiptTarget)}
          onClose={() => setReceiptTarget(null)}
          title="Payment Receipt"
        >
          <PaymentReceipt intentId={receiptTarget} onClose={() => setReceiptTarget(null)} />
        </Modal>
      )}

      {/* Timeline modal */}
      {timelineTarget && (
        <Modal
          open={Boolean(timelineTarget)}
          onClose={() => setTimelineTarget(null)}
          title="Payment status timeline"
        >
          <PaymentTimeline
            txHash={timelineTarget.txHash}
            status={timelineTarget.status}
            createdAt={timelineTarget.createdAt}
            confirmedAt={timelineTarget.confirmedAt}
            network={network}
          />
        </Modal>
      )}

      {/* Dispute modal */}
      {disputeTarget && (
        <DisputeModal
          open={Boolean(disputeTarget)}
          onClose={() => setDisputeTarget(null)}
          payment={disputeTarget}
          disputesUrl={DISPUTES_URL}
        />
      )}

      {/* Confirm payment modal */}
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
