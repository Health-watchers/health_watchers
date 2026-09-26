'use client';

import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import {
  ACCESS_LEVEL_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatFileSize,
} from '@/lib/documents/sampleData';
import type { AccessLevel, DocumentRecord, DocumentType } from '@/lib/documents/types';

export interface DocumentLibraryProps {
  documents: readonly DocumentRecord[];
  selectedDocumentId: string | null;
  annotationTotals: Record<string, number>;
  onSelect: (document: DocumentRecord) => void;
}

function accessVariant(level: AccessLevel): 'danger' | 'warning' | 'success' {
  if (level === 'restricted') return 'danger';
  if (level === 'clinic_staff') return 'warning';
  return 'success';
}

/** Issue #1316 — document library list. */
export function DocumentLibrary({
  documents,
  selectedDocumentId,
  annotationTotals,
  onSelect,
}: DocumentLibraryProps) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        No documents have been uploaded for this patient.
      </p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Document library">
      {documents.map((document) => {
        const isSelected = document.id === selectedDocumentId;
        const annotationCount = annotationTotals[document.id] ?? 0;

        return (
          <li key={document.id}>
            <button
              type="button"
              onClick={() => onSelect(document)}
              aria-pressed={isSelected}
              className={[
                'w-full rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/30'
                  : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800',
              ].join(' ')}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {document.fileName}
                </span>
                <Badge variant={accessVariant(document.accessLevel)}>
                  {ACCESS_LEVEL_LABELS[document.accessLevel]}
                </Badge>
              </span>
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                {DOCUMENT_TYPE_LABELS[document.documentType as DocumentType]} ·{' '}
                {formatFileSize(document.sizeBytes)} · {document.pageCount} page
                {document.pageCount === 1 ? '' : 's'} · v{document.currentVersion}
              </span>
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                {document.summary}
              </span>
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                Uploaded {formatDate(document.uploadedAt)} by {document.uploadedBy}
                {annotationCount > 0 && ` · ${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
