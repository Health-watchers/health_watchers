'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  Table,
  TableBody,
  TableHead,
  TableRow,
  TableTd,
  TableTh,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import {
  ACTION_LABELS,
  actionOptions,
  filterAccessLog,
  summariseAccess,
} from '@/lib/documents/accessLog';
import type { AccessLogEntry, ViewerAction } from '@/lib/documents/types';

export interface DocumentAccessLogProps {
  entries: readonly AccessLogEntry[];
  /** Restrict the log to one document, or `null` for every document. */
  documentId: string | null;
}

function actionVariant(
  action: ViewerAction
): 'danger' | 'warning' | 'success' | 'primary' | 'default' {
  if (action === 'downloaded' || action === 'printed') return 'warning';
  if (action === 'annotated' || action === 'annotation_deleted') return 'primary';
  if (action === 'viewed' || action === 'searched') return 'success';
  return 'default';
}

/** Issue #1316 — document access logging. */
export function DocumentAccessLog({ entries, documentId }: DocumentAccessLogProps) {
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');

  const scoped = useMemo(
    () => (documentId ? entries.filter((entry) => entry.documentId === documentId) : [...entries]),
    [entries, documentId]
  );
  const summary = useMemo(() => summariseAccess(scoped), [scoped]);

  const actors = useMemo(() => {
    const names = new Set(scoped.map((entry) => entry.actor));
    return [
      { value: 'all', label: 'All users' },
      ...Array.from(names, (name) => ({ value: name, label: name })),
    ];
  }, [scoped]);

  const visible = useMemo(
    () =>
      filterAccessLog(
        scoped,
        actionFilter as ViewerAction | 'all',
        actorFilter
      ),
    [scoped, actionFilter, actorFilter]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access log</CardTitle>
        <Badge variant={summary.total > 0 ? 'default' : 'warning'}>
          {summary.total} event{summary.total === 1 ? '' : 's'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
          <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Views</dt>
            <dd className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.viewed}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Downloads</dt>
            <dd className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.downloaded}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Prints</dt>
            <dd className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.printed}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Searches</dt>
            <dd className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.searches}
            </dd>
          </div>
          <div className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Users</dt>
            <dd className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {summary.distinctActors}
            </dd>
          </div>
        </dl>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Action"
            options={actionOptions()}
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
          />
          <Select
            label="User"
            options={actors}
            value={actorFilter}
            onChange={(event) => setActorFilter(event.target.value)}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="No access events"
            description="Viewing, searching, downloading, printing and annotating a document all appear here."
          />
        ) : (
          <Table aria-label="Document access log">
            <TableHead>
              <TableRow>
                <TableTh>When</TableTh>
                <TableTh>Action</TableTh>
                <TableTh>User</TableTh>
                <TableTh>Document</TableTh>
                <TableTh>Detail</TableTh>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((entry) => (
                <TableRow key={entry.id}>
                  <TableTd>{formatDateTime(entry.at)}</TableTd>
                  <TableTd>
                    <Badge variant={actionVariant(entry.action)}>{ACTION_LABELS[entry.action]}</Badge>
                  </TableTd>
                  <TableTd>{entry.actor}</TableTd>
                  <TableTd>{entry.documentName}</TableTd>
                  <TableTd>{entry.detail}</TableTd>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
