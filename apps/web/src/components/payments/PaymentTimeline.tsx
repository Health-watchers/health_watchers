'use client';

import { getStellarExplorerUrl } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';

export interface TimelineEvent {
  label: string;
  detail: string;
  date?: string;
  link?: string;
}

interface PaymentTimelineProps {
  txHash?: string;
  status: string;
  createdAt?: string;
  confirmedAt?: string;
  network?: string;
}

/**
 * Builds and renders a payment status timeline.
 * Extracted from PaymentTable to keep event-construction logic isolated.
 */
export function PaymentTimeline({
  txHash,
  status,
  createdAt,
  confirmedAt,
  network = 'testnet',
}: PaymentTimelineProps) {
  const events = buildTimeline({ txHash, status, createdAt, confirmedAt, network });

  return (
    <div className="space-y-4">
      {events.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
        >
          <p className="text-sm font-semibold text-neutral-800">{item.label}</p>
          <p className="text-sm text-neutral-600">{item.detail}</p>
          {item.date && (
            <p className="text-xs text-neutral-500">{formatDateTime(item.date)}</p>
          )}
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
  );
}

/**
 * Pure function that converts payment fields into an ordered list of timeline
 * events. Kept separate so it can be unit-tested without a React tree.
 */
export function buildTimeline({
  txHash,
  status,
  createdAt,
  confirmedAt,
  network = 'testnet',
}: {
  txHash?: string;
  status: string;
  createdAt?: string;
  confirmedAt?: string;
  network?: string;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (createdAt) {
    events.push({
      label: 'Created',
      detail: 'Payment intent recorded',
      date: createdAt,
    });
  }

  if (txHash) {
    events.push({
      label: 'Transaction submitted',
      detail: `Stellar transaction ${txHash.slice(0, 12)}…`,
      link: getStellarExplorerUrl(txHash, 'tx', network),
    });
  }

  if (status === 'pending') {
    events.push({
      label: 'Awaiting confirmation',
      detail: 'Transaction is pending on the network',
    });
  }

  if (status === 'confirmed' || status === 'completed') {
    events.push({
      label: 'Confirmed',
      detail: 'Payment is confirmed and settled',
      date: confirmedAt ?? createdAt,
    });
  }

  if (status === 'failed') {
    events.push({
      label: 'Failed',
      detail: 'Payment failed. Review details or file a dispute.',
    });
  }

  return events;
}
