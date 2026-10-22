'use client';

import { Badge, Button } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { formatFileSize } from '@/lib/documents/sampleData';
import type { DocumentRecord } from '@/lib/documents/types';

export interface DocumentVersionHistoryProps {
  document: DocumentRecord;
  onRestore: (versionId: string, version: number) => void;
}

/** Issue #1316 — document version history. */
export function DocumentVersionHistory({ document, onRestore }: DocumentVersionHistoryProps) {
  const versions = document.versions.slice().sort((a, b) => b.version - a.version);

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {versions.length} version{versions.length === 1 ? '' : 's'} · currently viewing version{' '}
        {document.currentVersion}.
      </p>
      <ol className="space-y-2">
        {versions.map((version) => {
          const isCurrent = version.version === document.currentVersion;
          return (
            <li
              key={version.id}
              className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Version {version.version}
                </span>
                {isCurrent && <Badge variant="success">Current</Badge>}
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDateTime(version.createdAt)} · {version.createdBy} ·{' '}
                  {formatFileSize(version.sizeBytes)}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                {version.changeNote}
              </p>
              {!isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => onRestore(version.id, version.version)}
                >
                  Restore this version
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Restoring creates a new version from the selected one, so the history is never rewritten.
      </p>
    </div>
  );
}
