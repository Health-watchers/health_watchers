'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorMessage, Spinner, toast } from '@/components/ui';
import {
  DocumentViewer,
  type Document as ViewerDocument,
} from '@/components/documents/DocumentViewer';
import { useAuth } from '@/context/AuthContext';
import { authJson } from '@/lib/authJson';
import {
  INBOX_ROLES,
  broadcastInboxChange,
  inboxKeys,
  useInboxRealtime,
  type NewMessageEvent,
} from '@/hooks/useInbox';

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = 'low' | 'normal' | 'high' | 'urgent';
type ThreadStatus = 'open' | 'closed';

interface ThreadSummary {
  threadId: string;
  subject: string;
  preview: string;
  lastDirection: 'patient_to_staff' | 'staff_to_patient';
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  hasAttachments: boolean;
  status: ThreadStatus;
  priority: Priority;
  patient: { id: string; name: string; systemId: string | null };
  assignee: { id: string; fullName: string } | null;
}

interface Attachment {
  fileName: string;
  url: string;
  mimeType?: string;
  size?: number;
}

interface ThreadMessage {
  id: string;
  body: string;
  subject: string;
  direction: 'patient_to_staff' | 'staff_to_patient';
  senderRole: string;
  senderName: string;
  attachments: Attachment[];
  readAt: string | null;
  createdAt: string;
}

interface ThreadDetail {
  threadId: string;
  subject: string;
  status: ThreadStatus;
  priority: Priority;
  assignee: { id: string; fullName: string | null } | null;
  closedAt: string | null;
  patient: { id: string; name: string; systemId?: string | null; sex?: string | null };
  messages: ThreadMessage[];
}

interface StaffMember {
  id: string;
  fullName: string;
  role: string;
}

interface Filters {
  status: ThreadStatus;
  assignee: 'all' | 'me' | 'unassigned';
  priority: '' | Priority;
  unread: boolean;
  q: string;
}

// ── Constants & helpers ───────────────────────────────────────────────────────

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

const PRIORITY_BADGE: Record<Priority, 'danger' | 'warning' | 'default' | null> = {
  urgent: 'danger',
  high: 'warning',
  normal: null, // the default isn't worth a badge
  low: 'default',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function guessMime(a: Attachment): string {
  if (a.mimeType) return a.mimeType;
  const ext = a.fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext ?? '')) {
    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  }
  return 'application/octet-stream';
}

function toViewerDocument(a: Attachment, createdAt: string): ViewerDocument {
  return {
    _id: a.url,
    fileName: a.fileName,
    mimeType: guessMime(a),
    documentType: 'message_attachment',
    sizeBytes: a.size ?? 0,
    currentVersion: 1,
    versionCount: 1,
    createdAt,
  };
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const variant = PRIORITY_BADGE[priority];
  if (!variant) return null;
  return (
    <Badge variant={variant} className="capitalize">
      {priority === 'urgent' ? '‼ ' : priority === 'high' ? '! ' : ''}
      {priority}
    </Badge>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const selectClass =
  'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100';

// ── Left pane: thread list ────────────────────────────────────────────────────

function ThreadList({
  filters,
  setFilters,
  threads,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  threads: ThreadSummary[];
  loading: boolean;
  error: Error | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-neutral-200 p-3 dark:border-neutral-700">
        <div
          className="flex rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800"
          role="tablist"
          aria-label="Thread status"
        >
          {(['open', 'closed'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={filters.status === s}
              onClick={() => setFilters({ ...filters, status: s })}
              className={[
                'flex-1 rounded px-3 py-1 text-sm font-medium capitalize',
                filters.status === s
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                  : 'text-neutral-500 dark:text-neutral-400',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search patient or message…"
          aria-label="Search threads"
          className={`${selectClass} w-full`}
        />
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Assignee"
            value={filters.assignee}
            onChange={(e) =>
              setFilters({ ...filters, assignee: e.target.value as Filters['assignee'] })
            }
            className={selectClass}
          >
            <option value="all">Everyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <select
            aria-label="Priority"
            value={filters.priority}
            onChange={(e) =>
              setFilters({ ...filters, priority: e.target.value as Filters['priority'] })
            }
            className={selectClass}
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={filters.unread}
              onChange={(e) => setFilters({ ...filters, unread: e.target.checked })}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Unread
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
        {error && (
          <div className="p-3">
            <ErrorMessage message={error.message} onRetry={onRetry} />
          </div>
        )}
        {loading && threads.length === 0 ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : threads.length === 0 && !error ? (
          <EmptyState
            title={filters.status === 'open' ? 'Inbox zero' : 'No closed conversations'}
            description={
              filters.status === 'open'
                ? 'New patient portal messages appear here instantly.'
                : 'Closed conversations will be listed here.'
            }
            className="py-12"
          />
        ) : (
          <ul role="listbox" aria-label="Conversations">
            {threads.map((t) => {
              const selected = t.threadId === selectedId;
              const unread = t.unreadCount > 0;
              return (
                <li key={t.threadId} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.threadId)}
                    className={[
                      'w-full border-b border-l-4 border-neutral-100 px-3 py-3 text-left transition-colors dark:border-b-neutral-800',
                      selected
                        ? 'border-l-primary-600 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-l-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/60',
                    ].join(' ')}
                  >
                    <div className="flex items-baseline gap-2">
                      {unread && (
                        <span
                          className="bg-primary-600 h-2 w-2 shrink-0 rounded-full"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={[
                          'min-w-0 flex-1 truncate text-sm',
                          unread
                            ? 'font-semibold text-neutral-900 dark:text-neutral-50'
                            : 'text-neutral-800 dark:text-neutral-200',
                        ].join(' ')}
                      >
                        {t.patient.name}
                      </span>
                      <time
                        dateTime={t.lastMessageAt}
                        title={fullTime(t.lastMessageAt)}
                        className="shrink-0 text-xs text-neutral-500"
                      >
                        {relativeTime(t.lastMessageAt)}
                      </time>
                    </div>
                    <p
                      className={[
                        'mt-0.5 truncate text-sm',
                        unread
                          ? 'font-medium text-neutral-800 dark:text-neutral-100'
                          : 'text-neutral-600 dark:text-neutral-300',
                      ].join(' ')}
                    >
                      {t.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {t.lastDirection === 'staff_to_patient' && 'You: '}
                      {t.preview}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={t.priority} />
                      {unread && (
                        <Badge variant="primary">
                          {t.unreadCount} new
                          <span className="sr-only"> message{t.unreadCount === 1 ? '' : 's'}</span>
                        </Badge>
                      )}
                      {t.hasAttachments && (
                        <span className="text-xs text-neutral-500" title="Has attachments">
                          📎<span className="sr-only">Has attachments</span>
                        </span>
                      )}
                      <span className="ml-auto truncate text-xs text-neutral-500">
                        {t.assignee ? t.assignee.fullName : 'Unassigned'}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Middle pane: conversation ─────────────────────────────────────────────────

function Conversation({
  thread,
  staff,
  currentUserId,
  onBack,
  onUpdate,
  updating,
}: {
  thread: ThreadDetail;
  staff: StaffMember[];
  currentUserId: string;
  onBack: () => void;
  onUpdate: (patch: {
    assigneeId?: string | null;
    priority?: Priority;
    status?: ThreadStatus;
  }) => void;
  updating: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [viewing, setViewing] = useState<{ doc: ViewerDocument; src: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft('');
  }, [thread.threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.threadId, thread.messages.length]);

  const reply = useMutation({
    mutationFn: (body: string) =>
      authJson(`/inbox/threads/${thread.threadId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      broadcastInboxChange();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to send reply'),
  });

  const send = () => {
    const body = draft.trim();
    if (body && !reply.isPending) reply.mutate(body);
  };

  const closed = thread.status === 'closed';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header + thread actions */}
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 rounded p-1 text-neutral-500 hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-800"
            aria-label="Back to conversations"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {thread.subject}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              with{' '}
              <Link
                href={`/patients/${thread.patient.id}`}
                className="text-primary-600 dark:text-primary-400 hover:underline"
              >
                {thread.patient.name}
              </Link>
              {closed && <Badge className="ml-2">Closed</Badge>}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="thread-assignee">
            Assignee
          </label>
          <select
            id="thread-assignee"
            value={thread.assignee?.id ?? ''}
            disabled={updating}
            onChange={(e) => onUpdate({ assigneeId: e.target.value || null })}
            className={selectClass}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === currentUserId ? `${s.fullName} (me)` : s.fullName}
              </option>
            ))}
          </select>
          {thread.assignee?.id !== currentUserId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={updating}
              onClick={() => onUpdate({ assigneeId: currentUserId })}
            >
              Assign to me
            </Button>
          )}
          <label className="sr-only" htmlFor="thread-priority">
            Priority
          </label>
          <select
            id="thread-priority"
            value={thread.priority}
            disabled={updating}
            onChange={(e) => onUpdate({ priority: e.target.value as Priority })}
            className={selectClass}
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} priority
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant={closed ? 'outline' : 'secondary'}
            className="ml-auto"
            loading={updating}
            onClick={() => onUpdate({ status: closed ? 'open' : 'closed' })}
          >
            {closed ? 'Reopen' : 'Close thread'}
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-neutral-50 px-4 py-4 dark:bg-neutral-900"
        aria-live="polite"
      >
        {thread.messages.map((m) => {
          const fromPatient = m.direction === 'patient_to_staff';
          return (
            <div
              key={m.id}
              className={['flex', fromPatient ? 'justify-start' : 'justify-end'].join(' ')}
            >
              <div className="max-w-[85%] sm:max-w-[75%]">
                <p
                  className={[
                    'mb-1 text-xs text-neutral-500',
                    fromPatient ? '' : 'text-right',
                  ].join(' ')}
                >
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {m.senderName}
                  </span>
                  {' · '}
                  <time dateTime={m.createdAt}>{fullTime(m.createdAt)}</time>
                </p>
                <div
                  className={[
                    'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                    fromPatient
                      ? 'border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
                      : 'bg-primary-600 text-white',
                  ].join(' ')}
                >
                  {m.body}
                </div>
                {m.attachments.length > 0 && (
                  <ul
                    className={[
                      'mt-1.5 flex flex-wrap gap-1.5',
                      fromPatient ? '' : 'justify-end',
                    ].join(' ')}
                  >
                    {m.attachments.map((a) => (
                      <li key={a.url}>
                        <button
                          type="button"
                          onClick={() =>
                            setViewing({ doc: toViewerDocument(a, m.createdAt), src: a.url })
                          }
                          className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                        >
                          <span aria-hidden="true">📎</span>
                          <span className="truncate">{a.fileName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-200 p-3 dark:border-neutral-700">
        {closed ? (
          <p className="text-center text-sm text-neutral-500">
            This conversation is closed.{' '}
            <button
              type="button"
              className="text-primary-600 underline"
              onClick={() => onUpdate({ status: 'open' })}
            >
              Reopen it
            </button>{' '}
            to reply.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label htmlFor="inbox-reply" className="sr-only">
              Reply to {thread.patient.name}
            </label>
            <textarea
              id="inbox-reply"
              rows={3}
              maxLength={5000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Reply to ${thread.patient.name}…`}
              className="focus:ring-primary-500 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                The patient is notified by email. Ctrl/⌘ + Enter to send.
              </span>
              <Button type="submit" size="sm" disabled={!draft.trim()} loading={reply.isPending}>
                Send reply
              </Button>
            </div>
          </form>
        )}
      </div>

      <DocumentViewer
        document={viewing?.doc ?? null}
        src={viewing?.src}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

// ── Right pane: context ───────────────────────────────────────────────────────

function ContextPane({ thread }: { thread: ThreadDetail }) {
  const patientMessages = thread.messages.filter((m) => m.direction === 'patient_to_staff');
  const attachments = thread.messages.flatMap((m) => m.attachments);
  return (
    <div className="h-full space-y-6 overflow-y-auto p-4 text-sm">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Patient</h3>
        <p className="mt-1 font-medium text-neutral-900 dark:text-neutral-100">
          {thread.patient.name}
        </p>
        {thread.patient.systemId && (
          <p className="font-mono text-xs text-neutral-500">{thread.patient.systemId}</p>
        )}
        <Link
          href={`/patients/${thread.patient.id}`}
          className="text-primary-600 dark:text-primary-400 mt-2 inline-block hover:underline"
        >
          Open chart →
        </Link>
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Conversation
        </h3>
        <dl className="mt-1 space-y-1 text-neutral-700 dark:text-neutral-300">
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">Started</dt>
            <dd>{fullTime(thread.messages[0].createdAt)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">Messages</dt>
            <dd>
              {thread.messages.length} ({patientMessages.length} from patient)
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">Status</dt>
            <dd className="capitalize">{thread.status}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">Priority</dt>
            <dd className="capitalize">{thread.priority}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">Assignee</dt>
            <dd>{thread.assignee?.fullName ?? 'Unassigned'}</dd>
          </div>
        </dl>
      </section>
      {attachments.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Attachments ({attachments.length})
          </h3>
          <ul className="mt-1 space-y-1 text-neutral-700 dark:text-neutral-300">
            {attachments.map((a) => (
              <li key={a.url} className="truncate">
                📎 {a.fileName}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InboxClient() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const allowed = !!user && INBOX_ROLES.includes(user.role);
  const selectedId = searchParams.get('thread');

  const [filters, setFilters] = useState<Filters>({
    status: 'open',
    assignee: 'all',
    priority: '',
    unread: false,
    q: '',
  });
  const q = useDebounced(filters.q.trim(), 300);

  const selectThread = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('thread', id);
      else params.delete('thread');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Surface patient messages that land outside the open conversation
  const onNewMessage = useCallback(
    (e: NewMessageEvent) => {
      if (e.direction === 'patient_to_staff' && e.threadId !== selectedId) {
        toast.info(`New patient message: ${e.subject}`);
      }
    },
    [selectedId]
  );
  useInboxRealtime(allowed, onNewMessage);

  const listParams = useMemo(() => {
    const p = new URLSearchParams({
      status: filters.status,
      assignee: filters.assignee,
      limit: '100',
    });
    if (filters.priority) p.set('priority', filters.priority);
    if (filters.unread) p.set('unread', 'true');
    if (q) p.set('q', q);
    return p.toString();
  }, [filters.status, filters.assignee, filters.priority, filters.unread, q]);

  const threadsQ = useQuery({
    queryKey: inboxKeys.threads({ listParams }),
    queryFn: () => authJson<ThreadSummary[]>(`/inbox/threads?${listParams}`),
    enabled: allowed,
    placeholderData: (prev) => prev,
  });

  const threadQ = useQuery({
    queryKey: inboxKeys.thread(selectedId ?? ''),
    queryFn: () => authJson<ThreadDetail>(`/inbox/threads/${selectedId}`),
    enabled: allowed && !!selectedId,
  });

  const staffQ = useQuery({
    queryKey: inboxKeys.staff(),
    queryFn: () => authJson<StaffMember[]>('/inbox/staff'),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });

  const markRead = useMutation({
    mutationFn: (threadId: string) =>
      authJson(`/inbox/threads/${threadId}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      broadcastInboxChange();
    },
  });

  // Opening a thread (or receiving a message while it's open and visible) marks it read
  const thread = threadQ.data;
  const unreadKey = thread
    ? thread.messages
        .filter((m) => m.direction === 'patient_to_staff' && !m.readAt)
        .map((m) => m.id)
        .join(',')
    : '';
  const lastMarked = useRef('');
  useEffect(() => {
    if (!thread || !unreadKey || lastMarked.current === unreadKey) return;
    if (document.visibilityState !== 'visible') return;
    lastMarked.current = unreadKey;
    markRead.mutate(thread.threadId);
  }, [thread, unreadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useMutation({
    mutationFn: (patch: {
      assigneeId?: string | null;
      priority?: Priority;
      status?: ThreadStatus;
    }) =>
      authJson(`/inbox/threads/${selectedId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (_d, patch) => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      broadcastInboxChange();
      if (patch.status === 'closed') toast.success('Conversation closed');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update conversation'),
  });

  if (authLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!allowed) {
    return (
      <EmptyState
        title="The care team inbox is for clinic staff"
        description="Sign in with a staff account to read and reply to patient messages."
      />
    );
  }

  return (
    <main className="flex h-[calc(100vh-3.5rem)] min-h-[32rem] flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Care Team Inbox
        </h1>
        <span className="text-sm text-neutral-500">
          {threadsQ.data
            ? `${threadsQ.data.length} conversation${threadsQ.data.length === 1 ? '' : 's'}`
            : ''}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[20rem_1fr] xl:grid-cols-[22rem_1fr_18rem]">
        {/* Left: thread list — hidden on mobile while a thread is open */}
        <aside
          aria-label="Conversations"
          className={[
            'min-h-0 border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
            selectedId ? 'hidden md:block' : 'block',
          ].join(' ')}
        >
          <ThreadList
            filters={filters}
            setFilters={setFilters}
            threads={threadsQ.data ?? []}
            loading={threadsQ.isLoading}
            error={threadsQ.error as Error | null}
            selectedId={selectedId}
            onSelect={selectThread}
            onRetry={() => threadsQ.refetch()}
          />
        </aside>

        {/* Middle: conversation */}
        <section
          aria-label="Conversation"
          className={[
            'min-h-0 bg-white dark:bg-neutral-900',
            selectedId ? 'block' : 'hidden md:block',
          ].join(' ')}
        >
          {!selectedId ? (
            <EmptyState
              title="Select a conversation"
              description="Choose a thread on the left to read and reply."
              className="h-full"
            />
          ) : threadQ.isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : threadQ.error || !thread ? (
            <div className="p-4">
              <ErrorMessage
                message={(threadQ.error as Error)?.message ?? 'Conversation not found'}
                onRetry={() => threadQ.refetch()}
              />
            </div>
          ) : (
            <Conversation
              thread={thread}
              staff={staffQ.data ?? []}
              currentUserId={user!.userId}
              onBack={() => selectThread(null)}
              onUpdate={(patch) => update.mutate(patch)}
              updating={update.isPending}
            />
          )}
        </section>

        {/* Right: patient / thread context */}
        <aside
          aria-label="Details"
          className="hidden min-h-0 border-l border-neutral-200 bg-white xl:block dark:border-neutral-700 dark:bg-neutral-900"
        >
          {thread && selectedId ? (
            <ContextPane thread={thread} />
          ) : (
            <p className="p-4 text-sm text-neutral-500">Conversation details appear here.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
