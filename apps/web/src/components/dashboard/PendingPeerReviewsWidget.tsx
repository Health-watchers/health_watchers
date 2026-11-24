'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { peerReviewKeys, peerReviewsApi, type PeerReview } from '@/lib/peerReviews';

const MAX_ITEMS = 5;

const nameOf = (v: PeerReview['revieweeId']) => (v && typeof v === 'object' ? v.fullName : '—');

function daysWaiting(createdAt: string) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
}

/** Reviewer's dashboard queue of peer reviews awaiting their submission. */
export function PendingPeerReviewsWidget() {
  const { user } = useAuth();
  const isReviewer = user?.role === 'DOCTOR' || user?.role === 'CLINIC_ADMIN';

  const { data, isLoading, isError } = useQuery({
    queryKey: [...peerReviewKeys.assigned, 'pending'],
    queryFn: () => peerReviewsApi.assigned('pending'),
    enabled: isReviewer,
  });

  if (!isReviewer) return null;

  const pending = (data ?? []).filter((r) => r.status !== 'completed');

  return (
    <section
      aria-labelledby="pending-peer-reviews-heading"
      className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-800"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3
          id="pending-peer-reviews-heading"
          className="text-lg font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Pending Peer Reviews
          {pending.length > 0 && (
            <Badge variant="warning" className="ml-2 align-middle">
              {pending.length}
            </Badge>
          )}
        </h3>
        <Link href="/peer-reviews" className="text-primary-600 text-xs hover:underline">
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="text-danger-600 text-sm">Unable to load peer reviews.</p>
      ) : pending.length === 0 ? (
        <p className="text-sm text-neutral-500">No peer reviews waiting for you.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
          {pending.slice(0, MAX_ITEMS).map((r) => (
            <li key={r._id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {r.encounterId?.chiefComplaint ?? 'Encounter'}
                </p>
                <p className="text-xs text-neutral-500">
                  {nameOf(r.revieweeId)} · waiting {daysWaiting(r.createdAt)}
                </p>
              </div>
              <Link
                href="/peer-reviews"
                className="text-primary-600 shrink-0 text-xs font-medium hover:underline"
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pending.length > MAX_ITEMS && (
        <p className="mt-2 text-xs text-neutral-500">+{pending.length - MAX_ITEMS} more</p>
      )}
    </section>
  );
}

export default PendingPeerReviewsWidget;
