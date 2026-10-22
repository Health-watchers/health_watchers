import type { AccessLogEntry, AccessSummary, DocumentRecord, ViewerAction } from './types';

export const ACTION_LABELS: Record<ViewerAction, string> = {
  viewed: 'Viewed',
  page_changed: 'Page changed',
  zoomed: 'Zoomed',
  rotated: 'Rotated',
  searched: 'Searched',
  downloaded: 'Downloaded',
  printed: 'Printed',
  annotated: 'Annotated',
  annotation_deleted: 'Annotation removed',
  version_restored: 'Version restored',
};

let accessCounter = 0;

export function makeAccessId(): string {
  accessCounter += 1;
  return `acc-${Date.now().toString(36)}-${accessCounter}`;
}

/**
 * Issue #1316 — every viewer interaction that touches a document is recorded
 * here. The viewer calls this for views, searches, downloads, prints,
 * annotations and restores, so the audit trail is complete by construction.
 */
export function createAccessEntry(input: {
  document: DocumentRecord;
  action: ViewerAction;
  actor: string;
  detail: string;
  at?: string;
}): AccessLogEntry {
  return {
    id: makeAccessId(),
    documentId: input.document.id,
    documentName: input.document.fileName,
    action: input.action,
    at: input.at ?? new Date().toISOString(),
    actor: input.actor,
    detail: input.detail,
  };
}

export function summariseAccess(entries: readonly AccessLogEntry[]): AccessSummary {
  const actions = new Set<ViewerAction>(entries.map((entry) => entry.action));
  const actors = new Set(entries.map((entry) => entry.actor));
  const timestamps = entries.map((entry) => entry.at).sort();

  return {
    total: entries.length,
    viewed: actions.has('viewed') ? entries.filter((entry) => entry.action === 'viewed').length : 0,
    downloaded: entries.filter((entry) => entry.action === 'downloaded').length,
    printed: entries.filter((entry) => entry.action === 'printed').length,
    searches: entries.filter((entry) => entry.action === 'searched').length,
    annotations: entries.filter((entry) => entry.action === 'annotated').length,
    lastAccessedAt: timestamps.length > 0 ? timestamps[timestamps.length - 1] ?? null : null,
    distinctActors: actors.size,
  };
}

export function filterAccessLog(
  entries: readonly AccessLogEntry[],
  action: ViewerAction | 'all',
  actor: string | 'all'
): AccessLogEntry[] {
  return entries
    .filter((entry) => action === 'all' || entry.action === action)
    .filter((entry) => actor === 'all' || entry.actor === actor)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function actionOptions(): { value: string; label: string }[] {
  return [
    { value: 'all', label: 'All actions' },
    ...(Object.keys(ACTION_LABELS) as ViewerAction[]).map((action) => ({
      value: action,
      label: ACTION_LABELS[action],
    })),
  ];
}
