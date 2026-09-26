'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorMessage,
  Input,
  PageHeader,
  PageWrapper,
  Select,
  Spinner,
} from '@/components/ui';
import { useAuth, type AppRole } from '@/context/AuthContext';
import { API_V1, ApiError, apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useVirtualRows } from '@/hooks/useVirtualRows';
import {
  EMPTY_AUDIT_FILTERS,
  filtersFromSearchParams,
  filtersToApiParams,
  filtersToSearchParams,
  hasActiveFilters,
  type AuditLogFilters,
} from '@/lib/auditLogFilters';

const ALLOWED_ROLES: AppRole[] = ['SUPER_ADMIN', 'CLINIC_ADMIN'];
const PAGE_SIZE = 100;
const ROW_HEIGHT = 44;
const DETAIL_HEIGHT = 320;

const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'PATIENT_VIEW',
  'PATIENT_CREATE',
  'PATIENT_UPDATE',
  'PATIENT_DELETE',
  'ENCOUNTER_VIEW',
  'ENCOUNTER_CREATE',
  'ENCOUNTER_UPDATE',
  'PAYMENT_CREATE',
  'EXPORT_PATIENT_DATA',
  'ALLERGY_CREATE',
  'ALLERGY_UPDATE',
  'ALLERGY_DELETE',
  'ALLERGY_OVERRIDE',
  'IMMUNIZATION_CREATE',
  'IMMUNIZATION_UPDATE',
  'IMMUNIZATION_DELETE',
  'PATIENT_PHOTO_ACCESS',
  'PAYMENT_EXPORT',
  'CRITICAL_LAB_RESULT',
  'CRITICAL_LAB_ACKNOWLEDGED',
  'CLINIC_SWITCH',
  'DATA_EXPORT_REQUEST',
  'DATA_EXPORT_FULFILLED',
  'CONSENT_VERSION_ACCEPTED',
  'MUTATION_CREATE',
  'MUTATION_UPDATE',
  'MUTATION_DELETE',
  'API_KEY_CREATE',
  'API_KEY_ROTATE',
  'API_KEY_REVOKE',
  'COMMUNICATION_LOG_VIEWED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
];

const RESOURCE_TYPES = [
  'Patient',
  'Encounter',
  'Payment',
  'LabResult',
  'Immunization',
  'Consent',
  'Referral',
  'Clinic',
  'ClinicSettings',
  'ApiKey',
  'ExportRequest',
  'Observation',
  'MedicationRequest',
];

interface AuditLogEntry {
  _id: string;
  timestamp: string;
  action: string;
  outcome: 'SUCCESS' | 'FAILURE';
  userId?: { _id: string; fullName?: string; email?: string } | string | null;
  clinicId?: { _id: string; name?: string } | string | null;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

interface AuditPage {
  logs: AuditLogEntry[];
  pagination: { total: number; nextCursor: string | null };
}

interface StaffUser {
  id: string;
  fullName: string;
  email: string;
}

function userLabel(user: AuditLogEntry['userId']) {
  if (!user) return 'System';
  if (typeof user === 'string') return user;
  return user.fullName || user.email || user._id;
}

// ── Before / after diff ─────────────────────────────────────────────────────

function extractDiff(metadata?: Record<string, unknown>) {
  if (!metadata) return null;
  const before = (metadata.before ?? metadata.previous ?? metadata.old) as
    | Record<string, unknown>
    | undefined;
  const after = (metadata.after ?? metadata.updated ?? metadata.new) as
    | Record<string, unknown>
    | undefined;
  if (before || after) return { before: before ?? {}, after: after ?? {} };

  // `changes: { field: { from, to } }`
  const changes = metadata.changes as Record<string, { from?: unknown; to?: unknown }> | undefined;
  if (changes && typeof changes === 'object') {
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};
    for (const [key, change] of Object.entries(changes)) {
      b[key] = change?.from;
      a[key] = change?.to;
    }
    return { before: b, after: a };
  }
  return null;
}

function fmt(value: unknown) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function AuditDiff({
  before,
  after,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  if (keys.length === 0)
    return <p className="text-xs text-neutral-400">No field changes recorded.</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-neutral-500">
          <th className="py-1 pr-2 font-medium">Field</th>
          <th className="py-1 pr-2 font-medium">Before</th>
          <th className="py-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {keys.map((key) => {
          const b = fmt(before[key]);
          const a = fmt(after[key]);
          const changed = b !== a;
          return (
            <tr key={key} className="align-top">
              <td className="py-0.5 pr-2 font-sans font-medium">{key}</td>
              <td
                className={[
                  'py-0.5 pr-2 break-all',
                  changed ? 'bg-danger-50 text-danger-700 dark:bg-danger-900/20 line-through' : '',
                ].join(' ')}
              >
                {b}
              </td>
              <td
                className={[
                  'py-0.5 break-all',
                  changed ? 'bg-success-50 text-success-700 dark:bg-success-900/20' : '',
                ].join(' ')}
              >
                {a}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AuditDetail({ log }: { log: AuditLogEntry }) {
  const diff = extractDiff(log.metadata);
  const {
    before: _b,
    after: _a,
    changes: _c,
    ...otherMeta
  } = (log.metadata ?? {}) as Record<string, unknown>;
  const requestMeta: [string, unknown][] = [
    ['Request ID', log.requestId],
    ['IP address', log.ipAddress],
    ['User agent', log.userAgent],
    ['Clinic', typeof log.clinicId === 'object' ? log.clinicId?.name : log.clinicId],
    ['Resource', log.resourceType ? `${log.resourceType} ${log.resourceId ?? ''}` : undefined],
    ...Object.entries(otherMeta),
  ];

  return (
    <div className="grid h-full gap-4 overflow-auto p-4 md:grid-cols-2">
      <div>
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Request metadata
        </h4>
        <dl className="space-y-1 text-xs">
          {requestMeta
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-2">
                <dt className="font-medium text-neutral-600 dark:text-neutral-400">{k}</dt>
                <dd className="font-mono break-all text-neutral-800 dark:text-neutral-200">
                  {fmt(v)}
                </dd>
              </div>
            ))}
        </dl>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
          Changes
        </h4>
        {diff ? (
          <AuditDiff {...diff} />
        ) : (
          <p className="text-xs text-neutral-400">No before/after snapshot for this event.</p>
        )}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const GRID_COLS =
  'grid grid-cols-[1.5rem_11rem_minmax(8rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_6rem_8rem] items-center gap-3 px-3';

export default function AuditLogExplorerClient() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);
  const [draft, setDraft] = useState<AuditLogFilters>(filters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Keep the form in sync with back/forward navigation
  useEffect(() => setDraft(filters), [filters]);

  const allowed = Boolean(user && ALLOWED_ROLES.includes(user.role));
  const apiQuery = filtersToApiParams(filters).toString();

  const logsQuery = useInfiniteQuery({
    queryKey: queryKeys.auditLogs.list(apiQuery),
    enabled: allowed,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = filtersToApiParams(filters, { cursor: pageParam, limit: PAGE_SIZE });
      const res = await apiV1Fetch(`/audit?${params}`);
      return res.data as AuditPage;
    },
    getNextPageParam: (last) => last.pagination.nextCursor,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.staff.all,
    enabled: allowed,
    queryFn: async () => (await apiV1Fetch('/users?limit=100')).data as StaffUser[],
  });

  const logs = useMemo(() => logsQuery.data?.pages.flatMap((p) => p.logs) ?? [], [logsQuery.data]);
  const total = logsQuery.data?.pages[0]?.pagination.total ?? 0;

  const getHeight = useCallback(
    (i: number) => (expanded.has(logs[i]?._id) ? ROW_HEIGHT + DETAIL_HEIGHT : ROW_HEIGHT),
    [logs, expanded]
  );
  const { scrollRef, scrollElement, rows, totalHeight, nearEnd } = useVirtualRows({
    count: logs.length,
    getHeight,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = logsQuery;
  const shouldLoadMore = nearEnd();
  useEffect(() => {
    if (shouldLoadMore && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [shouldLoadMore, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const applyFilters = (next: AuditLogFilters) => {
    const qs = filtersToSearchParams(next);
    setExpanded(new Set());
    scrollElement?.scrollTo({ top: 0 });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${API_V1}/audit/export?${apiQuery}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user && !allowed) router.replace('/');
  }, [authLoading, user, allowed, router]);

  if (authLoading || !user) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!allowed) {
    return (
      <PageWrapper className="py-10">
        <p className="text-sm text-neutral-500">You do not have access to audit logs.</p>
      </PageWrapper>
    );
  }

  const set =
    (key: keyof AuditLogFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((d) => ({ ...d, [key]: e.target.value }));

  const error = logsQuery.error;

  return (
    <PageWrapper className="space-y-4 py-6">
      <PageHeader
        title="Audit Log Explorer"
        subtitle="Investigate who accessed which record, and when."
        actions={
          <Button variant="outline" onClick={exportCsv} loading={exporting} disabled={exporting}>
            Export CSV
          </Button>
        }
      />
      {exportError && (
        <p role="alert" className="text-danger-600 text-sm">
          {exportError}
        </p>
      )}

      <form
        className="grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6 dark:border-neutral-700 dark:bg-neutral-800"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(draft);
        }}
      >
        <Input
          id="audit-from"
          label="From"
          type="date"
          value={draft.from}
          max={draft.to || undefined}
          onChange={set('from')}
        />
        <Input
          id="audit-to"
          label="To"
          type="date"
          value={draft.to}
          min={draft.from || undefined}
          onChange={set('to')}
        />
        <Select
          id="audit-user"
          label="User"
          value={draft.userId}
          onChange={set('userId')}
          options={[
            { value: '', label: 'All users' },
            ...(usersQuery.data ?? []).map((u) => ({
              value: String(u.id),
              label: u.fullName || u.email,
            })),
          ]}
        />
        <Select
          id="audit-action"
          label="Action"
          value={draft.action}
          onChange={set('action')}
          options={[
            { value: '', label: 'All actions' },
            ...AUDIT_ACTIONS.map((a) => ({ value: a, label: a })),
          ]}
        />
        <Select
          id="audit-resource"
          label="Resource type"
          value={draft.resourceType}
          onChange={set('resourceType')}
          options={[
            { value: '', label: 'All resources' },
            ...RESOURCE_TYPES.map((r) => ({ value: r, label: r })),
          ]}
        />
        <Input
          id="audit-patient"
          label="Patient ID"
          value={draft.patientId}
          placeholder="e.g. 64f…"
          onChange={set('patientId')}
        />
        <div className="flex gap-2 lg:col-span-6 lg:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={!hasActiveFilters(filters) && !hasActiveFilters(draft)}
            onClick={() => {
              setDraft(EMPTY_AUDIT_FILTERS);
              applyFilters(EMPTY_AUDIT_FILTERS);
            }}
          >
            Reset
          </Button>
          <Button type="submit">Apply filters</Button>
        </div>
      </form>

      <div
        className="flex items-center justify-between text-xs text-neutral-500"
        aria-live="polite"
      >
        <span>
          {logsQuery.isLoading
            ? 'Loading…'
            : `Showing ${logs.length.toLocaleString()} of ${total.toLocaleString()} events`}
        </span>
        {isFetchingNextPage && <span>Loading more…</span>}
      </div>

      {error ? (
        <ErrorMessage
          message={
            error instanceof ApiError && error.status === 403
              ? 'You do not have access to audit logs.'
              : (error as Error).message
          }
          onRetry={() => logsQuery.refetch()}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div
            role="table"
            aria-label="Audit log events"
            aria-rowcount={total}
            className="min-w-[56rem]"
          >
            <div
              role="row"
              className={`${GRID_COLS} h-10 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:border-neutral-700 dark:bg-neutral-900`}
            >
              <span />
              <span role="columnheader">Timestamp</span>
              <span role="columnheader">User</span>
              <span role="columnheader">Action</span>
              <span role="columnheader">Resource</span>
              <span role="columnheader">Outcome</span>
              <span role="columnheader">IP</span>
            </div>

            <div
              ref={scrollRef}
              className="relative h-[65vh] overflow-y-auto bg-white dark:bg-neutral-800"
            >
              {!logsQuery.isLoading && logs.length === 0 && (
                <p className="py-16 text-center text-sm text-neutral-400">
                  No audit events match these filters.
                </p>
              )}
              <div style={{ height: totalHeight }} className="relative">
                {rows.map(({ index, top, height }) => {
                  const log = logs[index];
                  const isOpen = expanded.has(log._id);
                  return (
                    <div
                      key={log._id}
                      role="row"
                      aria-rowindex={index + 1}
                      className="absolute inset-x-0 border-b border-neutral-100 dark:border-neutral-700"
                      style={{ top, height }}
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggle(log._id)}
                        className={`${GRID_COLS} focus-visible:bg-primary-50 w-full text-left text-sm hover:bg-neutral-50 focus-visible:outline-none dark:hover:bg-neutral-700`}
                        style={{ height: ROW_HEIGHT }}
                      >
                        <span aria-hidden="true" className="text-neutral-400">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <span role="cell" className="truncate font-mono text-xs">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        <span role="cell" className="truncate">
                          {userLabel(log.userId)}
                        </span>
                        <span role="cell" className="truncate font-mono text-xs">
                          {log.action}
                        </span>
                        <span role="cell" className="truncate text-xs">
                          {log.resourceType ?? '—'}
                          {log.resourceId && (
                            <span className="ml-1 font-mono text-neutral-400">
                              {log.resourceId}
                            </span>
                          )}
                        </span>
                        <span role="cell">
                          <Badge variant={log.outcome === 'FAILURE' ? 'danger' : 'success'}>
                            {log.outcome}
                          </Badge>
                        </span>
                        <span role="cell" className="truncate font-mono text-xs">
                          {log.ipAddress ?? '—'}
                        </span>
                      </button>
                      {isOpen && (
                        <div
                          style={{ height: DETAIL_HEIGHT }}
                          className="bg-neutral-50 dark:bg-neutral-900"
                        >
                          <AuditDetail log={log} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
