'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ErrorMessage, Select, Spinner, Textarea, toast } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { authJson } from '@/lib/authJson';
import { peerReviewKeys, peerReviewsApi, type PeerReview } from '@/lib/peerReviews';

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

const nameOf = (v: PeerReview['reviewerId'], fallback: string) =>
  v && typeof v === 'object' ? v.fullName : fallback;

function ExistingReview({ review }: { review: PeerReview }) {
  const completed = review.status === 'completed';
  return (
    <div className="space-y-3 text-sm" data-testid="peer-review-status">
      <div className="flex flex-wrap items-center gap-2">
        {completed ? (
          <Badge variant="success">Review completed {fmtDate(review.completedAt)}</Badge>
        ) : (
          <Badge variant="warning">Review pending</Badge>
        )}
        {review.requiresFollowUp && <Badge variant="danger">⚑ Requires follow-up</Badge>}
      </div>
      <p className="text-neutral-600 dark:text-neutral-300">
        Reviewer:{' '}
        <span className="font-medium">
          {review.isAnonymous && !review.reviewerId
            ? 'Anonymous reviewer'
            : nameOf(review.reviewerId, 'Assigned reviewer')}
        </span>
        {' · '}Requested {fmtDate(review.createdAt)}
      </p>
      {completed && (
        <>
          <p>
            Overall rating:{' '}
            <span className="font-semibold tabular-nums">{review.rating ?? '—'}/5</span>
          </p>
          {review.feedback && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Comments
              </p>
              <p className="mt-1 whitespace-pre-line">{review.feedback}</p>
            </div>
          )}
          {review.recommendations && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Recommendations
              </p>
              <p className="mt-1 whitespace-pre-line">{review.recommendations}</p>
            </div>
          )}
        </>
      )}
      <Link href="/peer-reviews" className="text-primary-600 inline-block text-xs hover:underline">
        Open peer review workspace →
      </Link>
    </div>
  );
}

function RequestForm({
  encounterId,
  authorId,
  onDone,
}: {
  encounterId: string;
  authorId?: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reviewerId, setReviewerId] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const reviewers = useQuery({
    queryKey: peerReviewKeys.reviewers(authorId),
    queryFn: () => peerReviewsApi.reviewers(authorId),
  });

  const submit = useMutation({
    mutationFn: () =>
      peerReviewsApi.request({
        encounterId,
        reviewerId,
        isAnonymous,
        requestNote: requestNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Peer review requested');
      queryClient.invalidateQueries({ queryKey: peerReviewKeys.all });
      onDone();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to request peer review'),
  });

  if (reviewers.isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }
  if (reviewers.error) {
    return (
      <ErrorMessage
        message={(reviewers.error as Error).message}
        onRetry={() => reviewers.refetch()}
      />
    );
  }

  const options = (reviewers.data ?? []).map((r) => ({
    value: r.id,
    label: `${r.fullName}${r.role === 'CLINIC_ADMIN' ? ' (Admin)' : ''}`,
  }));

  return (
    <form
      aria-label="Request peer review"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (reviewerId) submit.mutate();
      }}
    >
      <Select
        id="peer-reviewer"
        label="Reviewer"
        required
        placeholder={options.length ? 'Select a colleague' : 'No eligible reviewers'}
        options={options}
        value={reviewerId}
        onChange={(e) => setReviewerId(e.target.value)}
        disabled={!options.length}
      />
      <Textarea
        id="peer-review-note"
        label="Focus areas (optional)"
        rows={3}
        maxLength={1000}
        value={requestNote}
        onChange={(e) => setRequestNote(e.target.value)}
        placeholder="e.g. Please check the antibiotic choice and follow-up plan"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Keep the reviewer anonymous to the author
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!reviewerId} loading={submit.isPending}>
          Send request
        </Button>
      </div>
    </form>
  );
}

/**
 * Peer review panel on the encounter detail page: shows the review attached to the encounter,
 * or lets a clinic admin / the encounter's author request one.
 */
export function PeerReviewRequestCard({ encounterId }: { encounterId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const isClinician = isAdmin || user?.role === 'DOCTOR';

  const review = useQuery({
    queryKey: peerReviewKeys.encounter(encounterId),
    queryFn: () => peerReviewsApi.forEncounter(encounterId),
    enabled: isClinician,
  });

  const encounter = useQuery({
    queryKey: ['encounter', encounterId],
    queryFn: () => authJson<{ attendingDoctorId?: string }>(`/encounters/${encounterId}`),
    enabled: isClinician,
  });

  if (!user || !isClinician) return null;

  const authorId = encounter.data?.attendingDoctorId;
  const canRequest = isAdmin || (!!authorId && authorId === user.userId);

  return (
    <Card className="mt-6" aria-labelledby="peer-review-heading">
      <div className="mb-4 flex items-center justify-between">
        <h2
          id="peer-review-heading"
          className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
        >
          Peer review
        </h2>
        {!review.data && canRequest && !open && !review.isLoading && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Request peer review
          </Button>
        )}
      </div>

      {review.isLoading || encounter.isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : review.error ? (
        <ErrorMessage message={(review.error as Error).message} onRetry={() => review.refetch()} />
      ) : review.data ? (
        <ExistingReview review={review.data} />
      ) : open ? (
        <RequestForm encounterId={encounterId} authorId={authorId} onDone={() => setOpen(false)} />
      ) : (
        <p className="text-sm text-neutral-500">
          {canRequest
            ? 'This encounter has not been peer reviewed. Request a review from a colleague to get feedback.'
            : 'This encounter has not been peer reviewed.'}
        </p>
      )}
    </Card>
  );
}

export default PeerReviewRequestCard;
