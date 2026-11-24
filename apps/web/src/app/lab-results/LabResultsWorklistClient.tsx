'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorMessage,
  Modal,
  PageHeader,
  PageWrapper,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toast,
} from '@/components/ui';
import { apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface LabResultEntry {
  parameter?: string;
  name?: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag?: string;
}

interface WorklistItem {
  id: string;
  patientId: string;
  patient?: { firstName: string; lastName: string; systemId?: string };
  testName: string;
  testCode?: string;
  status: string;
  results?: LabResultEntry[];
  isCritical?: boolean;
  criticalReason?: string;
  resultedAt?: string;
  orderedAt: string;
  reviewedAt?: string;
  reviewComment?: string;
}

type TabKey = 'review' | 'critical' | 'reviewed';

const PENDING_KEY = [...queryKeys.labResults.worklist(), 'pending'] as const;
const REVIEWED_KEY = [...queryKeys.labResults.worklist(), 'reviewed'] as const;

async function fetchWorklist(reviewed: boolean): Promise<WorklistItem[]> {
  const params = new URLSearchParams({
    status: 'resulted',
    reviewed: String(reviewed),
    includePatient: 'true',
    limit: reviewed ? '50' : '100',
  });
  const res = await apiV1Fetch(`/lab-results?${params}`);
  return res.data ?? [];
}

const CRITICAL_FLAGS = new Set(['HH', 'LL', 'critical']);
const ABNORMAL_FLAGS = new Set(['H', 'L', 'high', 'low']);

/** Critical first, then most recently resulted. */
export function sortWorklist(items: WorklistItem[]): WorklistItem[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.isCritical) !== Boolean(b.isCritical)) return a.isCritical ? -1 : 1;
    const ta = new Date(a.resultedAt ?? a.orderedAt).getTime();
    const tb = new Date(b.resultedAt ?? b.orderedAt).getTime();
    return tb - ta;
  });
}

function patientName(item: WorklistItem) {
  return item.patient ? `${item.patient.firstName} ${item.patient.lastName}` : 'Patient';
}

function ResultValues({ results }: { results?: LabResultEntry[] }) {
  if (!results?.length) return null;
  const flagged = results.filter(
    (r) => r.flag && (CRITICAL_FLAGS.has(r.flag) || ABNORMAL_FLAGS.has(r.flag))
  );
  const shown = flagged.length ? flagged : results.slice(0, 3);

  return (
    <ul className="mt-2 space-y-1 text-sm">
      {shown.map((r, i) => {
        const critical = r.flag ? CRITICAL_FLAGS.has(r.flag) : false;
        return (
          <li
            key={`${r.parameter ?? r.name}-${i}`}
            className="flex flex-wrap items-baseline gap-x-2"
          >
            <span className="font-medium text-neutral-700 dark:text-neutral-300">
              {r.parameter ?? r.name}
            </span>
            <span
              className={
                critical
                  ? 'text-danger-700 font-semibold'
                  : 'text-neutral-900 dark:text-neutral-100'
              }
            >
              {r.value} {r.unit}
            </span>
            {r.flag && r.flag !== 'N' && r.flag !== 'normal' && (
              <Badge variant={critical ? 'danger' : 'warning'}>{r.flag}</Badge>
            )}
            {r.referenceRange && (
              <span className="text-xs text-neutral-500">ref {r.referenceRange}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function WorklistRow({
  item,
  highlight,
  onReview,
}: {
  item: WorklistItem;
  highlight: boolean;
  onReview?: (item: WorklistItem) => void;
}) {
  return (
    <li
      className={[
        'rounded-lg border bg-white p-4 shadow-sm transition-colors dark:bg-neutral-800',
        item.isCritical && !item.reviewedAt
          ? 'border-danger-300 dark:border-danger-700 border-l-4'
          : 'border-neutral-200 dark:border-neutral-700',
        highlight ? 'ring-danger-400 ring-2' : '',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.isCritical && <Badge variant="danger">CRITICAL</Badge>}
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
              {item.testName}
            </h3>
            {item.testCode && (
              <span className="font-mono text-xs text-neutral-400">{item.testCode}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            <Link
              href={`/patients/${item.patientId}`}
              className="text-primary-600 font-medium hover:underline"
            >
              {patientName(item)}
            </Link>
            {item.patient?.systemId && (
              <span className="ml-2 font-mono text-xs text-neutral-400">
                {item.patient.systemId}
              </span>
            )}
            <span className="ml-2 text-xs">
              Resulted {new Date(item.resultedAt ?? item.orderedAt).toLocaleString()}
            </span>
          </p>
          {item.criticalReason && (
            <p className="text-danger-700 mt-1 text-sm">{item.criticalReason}</p>
          )}
          <ResultValues results={item.results} />
          {item.reviewedAt && (
            <p className="mt-2 text-xs text-neutral-500">
              Reviewed {new Date(item.reviewedAt).toLocaleString()}
              {item.reviewComment && <> — “{item.reviewComment}”</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/patients/${item.patientId}`}
            className="inline-flex h-8 items-center rounded-md border border-neutral-300 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300"
          >
            Open chart
          </Link>
          {onReview && (
            <Button
              size="sm"
              variant={item.isCritical ? 'danger' : 'primary'}
              onClick={() => onReview(item)}
            >
              Mark reviewed
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function LabResultsWorklistClient() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('review');
  const [reviewing, setReviewing] = useState<WorklistItem | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const pendingQuery = useQuery({ queryKey: PENDING_KEY, queryFn: () => fetchWorklist(false) });
  const reviewedQuery = useQuery({ queryKey: REVIEWED_KEY, queryFn: () => fetchWorklist(true) });

  // useRealtimeUpdates (via RealtimeProvider) refreshes the lab caches on `lab:critical`;
  // here we just surface the alert and highlight the new row.
  useEffect(() => {
    const onCritical = (e: Event) => {
      const detail = (
        e as CustomEvent<{ labResultId?: string; testName?: string; reason?: string }>
      ).detail;
      if (detail?.labResultId) setFreshIds((prev) => new Set(prev).add(String(detail.labResultId)));
      setToast({
        message: `New critical result${detail?.testName ? `: ${detail.testName}` : ''}${detail?.reason ? ` — ${detail.reason}` : ''}`,
        type: 'error',
      });
    };
    window.addEventListener('lab:critical', onCritical);
    return () => window.removeEventListener('lab:critical', onCritical);
  }, []);

  const pending = useMemo(() => sortWorklist(pendingQuery.data ?? []), [pendingQuery.data]);
  const critical = useMemo(() => pending.filter((i) => i.isCritical), [pending]);
  const reviewed = reviewedQuery.data ?? [];

  const review = useMutation({
    mutationFn: ({ item, comment }: { item: WorklistItem; comment: string }) =>
      apiV1Fetch(`/lab-results/${item.id}/review`, {
        method: 'POST',
        body: JSON.stringify(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    // Move the item between cached lists — no refetch needed
    onSuccess: (res, { item }) => {
      const updated: WorklistItem = { ...item, ...res.data, patient: item.patient };
      queryClient.setQueryData<WorklistItem[]>(PENDING_KEY, (prev) =>
        prev?.filter((i) => i.id !== item.id)
      );
      queryClient.setQueryData<WorklistItem[]>(REVIEWED_KEY, (prev) => [
        updated,
        ...(prev ?? []).filter((i) => i.id !== item.id),
      ]);
      setReviewing(null);
      setComment('');
      setToast({ message: `${item.testName} marked reviewed`, type: 'success' });
    },
    onError: (err: Error) => setToast({ message: err.message, type: 'error' }),
  });

  const openReview = (item: WorklistItem) => {
    setComment('');
    setReviewing(item);
  };

  const renderList = (
    items: WorklistItem[],
    loading: boolean,
    error: unknown,
    refetch: () => void,
    reviewable: boolean,
    emptyTitle: string
  ) => {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      );
    }
    if (error) return <ErrorMessage message={(error as Error).message} onRetry={refetch} />;
    if (items.length === 0)
      return <EmptyState title={emptyTitle} description="You're all caught up." />;
    return (
      <ul className="space-y-3">
        {items.map((item) => (
          <WorklistRow
            key={item.id}
            item={item}
            highlight={freshIds.has(item.id)}
            onReview={reviewable ? openReview : undefined}
          />
        ))}
      </ul>
    );
  };

  return (
    <PageWrapper className="space-y-6 py-6">
      <PageHeader
        title="Lab Results"
        subtitle="Clinic-wide worklist of results awaiting clinician review"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="review">Needs review ({pending.length})</TabsTrigger>
          <TabsTrigger value="critical">
            <span className="flex items-center gap-2">
              Critical
              {critical.length > 0 && <Badge variant="danger">{critical.length}</Badge>}
            </span>
          </TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="pt-4">
          {renderList(
            pending,
            pendingQuery.isLoading,
            pendingQuery.error,
            pendingQuery.refetch,
            true,
            'No results awaiting review'
          )}
        </TabsContent>
        <TabsContent value="critical" className="pt-4">
          {renderList(
            critical,
            pendingQuery.isLoading,
            pendingQuery.error,
            pendingQuery.refetch,
            true,
            'No unreviewed critical results'
          )}
        </TabsContent>
        <TabsContent value="reviewed" className="pt-4">
          {renderList(
            reviewed,
            reviewedQuery.isLoading,
            reviewedQuery.error,
            reviewedQuery.refetch,
            false,
            'No reviewed results yet'
          )}
        </TabsContent>
      </Tabs>

      <Modal
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        title="Mark result reviewed"
        description={reviewing ? `${reviewing.testName} — ${patientName(reviewing)}` : undefined}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (reviewing) review.mutate({ item: reviewing, comment });
          }}
        >
          {reviewing?.isCritical && (
            <p className="bg-danger-50 text-danger-700 rounded-md p-3 text-sm">
              This is a critical result. Marking it reviewed also acknowledges the critical value.
            </p>
          )}
          <Textarea
            id="lab-review-comment"
            label="Comment (optional)"
            rows={3}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={review.isPending} disabled={review.isPending}>
              Mark reviewed
            </Button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageWrapper>
  );
}
