'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ErrorMessage, Modal, Skeleton, Textarea } from '@/components/ui';
import { EMERGENCY_ACCESS_REASON_LABELS } from '@/components/patients/EmergencyAccess';
import { apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Compliance review queue for break-the-glass emergency accesses (#1493).
 * Every emergency access lands here as PENDING until a compliance officer
 * approves it or flags it for follow-up.
 */

type ReviewStatus = 'PENDING' | 'APPROVED' | 'FLAGGED';

export interface EmergencyAccessRecord {
  id: string;
  userId: { _id: string; fullName?: string; email?: string; role?: string } | string;
  patientId: { _id: string; systemId?: string } | string;
  reason: string;
  justification: string;
  grantedAt: string;
  expiresAt: string;
  endedAt: string | null;
  isActive: boolean;
  reviewStatus: ReviewStatus;
  reviewedBy: { fullName?: string } | string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

const FILTERS: { value: ReviewStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Pending review' },
  { value: 'FLAGGED', label: 'Flagged' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ALL', label: 'All' },
];

const REVIEW_BADGE: Record<ReviewStatus, 'warning' | 'danger' | 'success'> = {
  PENDING: 'warning',
  FLAGGED: 'danger',
  APPROVED: 'success',
};

export async function fetchEmergencyAccesses(
  status: ReviewStatus | 'ALL'
): Promise<{ data: EmergencyAccessRecord[]; total: number }> {
  const query = status === 'ALL' ? '?limit=100' : `?status=${status}&limit=100`;
  const res = await apiV1Fetch(`/compliance/emergency-access${query}`);
  return { data: res.data ?? [], total: res.pagination?.total ?? 0 };
}

function clinician(record: EmergencyAccessRecord) {
  if (typeof record.userId === 'string') return { name: record.userId, detail: '' };
  return {
    name: record.userId.fullName ?? record.userId.email ?? record.userId._id,
    detail: [record.userId.role, record.userId.email].filter(Boolean).join(' · '),
  };
}

function patientRef(record: EmergencyAccessRecord) {
  return typeof record.patientId === 'string'
    ? record.patientId
    : (record.patientId.systemId ?? record.patientId._id);
}

function accessState(record: EmergencyAccessRecord) {
  if (record.isActive) return <Badge variant="danger">Active</Badge>;
  if (record.endedAt) return <Badge>Ended early</Badge>;
  return <Badge>Expired</Badge>;
}

export function EmergencyAccessReviewQueue() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ReviewStatus | 'ALL'>('PENDING');
  const [reviewing, setReviewing] = useState<{
    record: EmergencyAccessRecord;
    decision: 'APPROVED' | 'FLAGGED';
  } | null>(null);
  const [notes, setNotes] = useState('');

  const query = useQuery({
    queryKey: queryKeys.compliance.emergencyAccess(filter),
    queryFn: () => fetchEmergencyAccesses(filter),
    // Keep the queue current while officers have it open
    refetchInterval: 30_000,
  });

  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'APPROVED' | 'FLAGGED' }) =>
      apiV1Fetch(`/compliance/emergency-access/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      }),
    onSuccess: () => {
      setReviewing(null);
      setNotes('');
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.compliance.all, 'emergency-access'],
      });
    },
  });

  const records = query.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Every break-the-glass access to a patient outside the clinician&apos;s care team is listed
          here for review.
        </p>
        <div role="group" aria-label="Filter by review status" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? 'primary' : 'outline'}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64" />
      ) : query.error ? (
        <ErrorMessage message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-700">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                {['Clinician', 'Patient', 'Reason', 'Granted', 'Access', 'Review', ''].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white dark:divide-neutral-800 dark:bg-neutral-800">
              {records.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    No emergency accesses in this view.
                  </td>
                </tr>
              )}
              {records.map((record) => {
                const who = clinician(record);
                return (
                  <tr key={record.id} className="align-top">
                    <td className="px-4 py-2">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">
                        {who.name}
                      </p>
                      {who.detail && <p className="text-xs text-neutral-500">{who.detail}</p>}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{patientRef(record)}</td>
                    <td className="max-w-xs px-4 py-2">
                      <p className="font-medium">
                        {EMERGENCY_ACCESS_REASON_LABELS[record.reason] ?? record.reason}
                      </p>
                      <p className="whitespace-pre-line text-xs text-neutral-500">
                        {record.justification}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {new Date(record.grantedAt).toLocaleString()}
                      <p className="text-xs text-neutral-500">
                        until {new Date(record.endedAt ?? record.expiresAt).toLocaleTimeString()}
                      </p>
                    </td>
                    <td className="px-4 py-2">{accessState(record)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={REVIEW_BADGE[record.reviewStatus]}>
                        {record.reviewStatus.toLowerCase()}
                      </Badge>
                      {record.reviewNotes && (
                        <p className="mt-1 text-xs text-neutral-500">{record.reviewNotes}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {record.reviewStatus === 'PENDING' && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReviewing({ record, decision: 'APPROVED' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setReviewing({ record, decision: 'FLAGGED' })}
                          >
                            Flag
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={
          reviewing?.decision === 'FLAGGED'
            ? 'Flag emergency access for follow-up'
            : 'Approve emergency access'
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reviewing) review.mutate({ id: reviewing.record.id, decision: reviewing.decision });
          }}
        >
          <Textarea
            id="emergency-review-notes"
            label="Review notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required={reviewing?.decision === 'FLAGGED'}
            helperText={
              reviewing?.decision === 'FLAGGED'
                ? 'Describe why this access needs follow-up.'
                : 'Optional'
            }
          />
          {review.error && (
            <p role="alert" className="text-danger-600 text-sm">
              {(review.error as Error).message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={reviewing?.decision === 'FLAGGED' ? 'danger' : 'primary'}
              disabled={review.isPending}
            >
              {reviewing?.decision === 'FLAGGED' ? 'Flag access' : 'Approve access'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
