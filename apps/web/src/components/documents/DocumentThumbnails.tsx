'use client';

import { annotationsForDocument } from '@/lib/documents/annotations';
import type { DocumentAnnotation, DocumentRecord } from '@/lib/documents/types';

export interface DocumentThumbnailsProps {
  document: DocumentRecord;
  annotations: readonly DocumentAnnotation[];
  currentPage: number;
  matchedPages: readonly number[];
  onSelectPage: (page: number) => void;
}

/** Issue #1316 — document thumbnails and page navigation. */
export function DocumentThumbnails({
  document,
  annotations,
  currentPage,
  matchedPages,
  onSelectPage,
}: DocumentThumbnailsProps) {
  const counts = new Map<number, number>();
  for (const annotation of annotationsForDocument(annotations, document.id)) {
    counts.set(annotation.page, (counts.get(annotation.page) ?? 0) + 1);
  }
  const matches = new Set(matchedPages);

  return (
    <div aria-label="Page thumbnails" className="space-y-2">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {document.pageCount} page{document.pageCount === 1 ? '' : 's'} — select a page to open it.
      </p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: document.pageCount }, (_unused, index) => {
          const page = index + 1;
          const isCurrent = page === currentPage;
          const annotationCount = counts.get(page) ?? 0;
          const hasMatch = matches.has(page);

          return (
            <li key={page} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelectPage(page)}
                aria-current={isCurrent ? 'true' : undefined}
                className={[
                  'flex h-24 w-16 flex-col items-center justify-center gap-1 rounded-md border text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  isCurrent
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                <span className="text-base font-semibold">{page}</span>
                <span className="text-[0.65rem] leading-tight">Page {page}</span>
                {annotationCount > 0 && (
                  <span className="rounded-sm bg-warning-100 px-1 text-[0.6rem] text-warning-700">
                    {annotationCount} note{annotationCount === 1 ? '' : 's'}
                  </span>
                )}
                {hasMatch && (
                  <span className="rounded-sm bg-primary-100 px-1 text-[0.6rem] text-primary-700">
                    match
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
