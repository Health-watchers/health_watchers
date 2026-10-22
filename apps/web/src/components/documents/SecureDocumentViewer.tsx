'use client';

import { Badge, Button } from '@/components/ui';
import {
  ACCESS_LEVEL_LABELS,
  DOCUMENT_TYPE_LABELS,
  formatFileSize,
} from '@/lib/documents/sampleData';
import type { DocumentRecord } from '@/lib/documents/types';

export interface SecureDocumentViewerProps {
  document: DocumentRecord;
  /** Signed URL for the real file; `null` renders the extracted text instead. */
  documentUrl: string | null;
  page: number;
  zoom: number;
  rotation: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onRotate: (direction: 1 | -1) => void;
  onDownload: () => void;
  onPrint: () => void;
}

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 3];
const MIN_ZOOM = ZOOM_STEPS[0] ?? 1;
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 3;

/** Issue #1316 — secure document viewing surface with zoom and rotation. */
export function SecureDocumentViewer({
  document,
  documentUrl,
  page,
  zoom,
  rotation,
  onPageChange,
  onZoomChange,
  onRotate,
  onDownload,
  onPrint,
}: SecureDocumentViewerProps) {
  const pageText = document.textLines[page - 1] ?? '';
  const isImage = document.mimeType.startsWith('image/');
  const restricted = document.accessLevel === 'restricted';

  const stepZoom = (direction: 1 | -1) => {
    const currentIndex = ZOOM_STEPS.findIndex((step) => step >= zoom);
    const baseIndex = currentIndex === -1 ? 1 : currentIndex;
    const nextIndex = Math.min(Math.max(baseIndex + direction, 0), ZOOM_STEPS.length - 1);
    const next = ZOOM_STEPS[nextIndex];
    if (next !== undefined) onZoomChange(next);
  };

  return (
    <section aria-label="Document viewer" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {document.fileName}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {DOCUMENT_TYPE_LABELS[document.documentType]} ·{' '}
            {ACCESS_LEVEL_LABELS[document.accessLevel]} · {formatFileSize(document.sizeBytes)} ·
            version {document.currentVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={restricted ? 'danger' : 'default'}>
            {restricted ? 'Restricted' : 'Authorised'}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => stepZoom(-1)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            −
          </Button>
          <span className="text-xs text-neutral-600 dark:text-neutral-400" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => stepZoom(1)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            +
          </Button>
          <Button size="sm" variant="outline" onClick={() => onRotate(-1)} aria-label="Rotate left">
            ↺
          </Button>
          <Button size="sm" variant="outline" onClick={() => onRotate(1)} aria-label="Rotate right">
            ↻
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ‹
          </Button>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            Page {page} of {document.pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= document.pageCount}
            aria-label="Next page"
          >
            ›
          </Button>
          <Button size="sm" variant="outline" onClick={onDownload}>
            Download
          </Button>
          <Button size="sm" variant="outline" onClick={onPrint}>
            Print
          </Button>
        </div>
      </div>

      {restricted && (
        <p
          role="status"
          className="border-danger-200 bg-danger-50 rounded-md border px-3 py-2 text-sm text-neutral-700 dark:border-danger-800 dark:bg-danger-900/20"
        >
          This document is restricted. Every view, download and print is recorded in the access
          log.
        </p>
      )}

      <div className="overflow-auto rounded-lg border border-neutral-200 bg-neutral-100 p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div
          className="bg-white shadow-sm transition-transform"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            margin: '0 auto',
            width: '100%',
            maxWidth: '48rem',
            minHeight: '22rem',
          }}
        >
          {documentUrl ? (
            isImage ? (
              <img
                src={documentUrl}
                alt={`${document.fileName}, page ${page}`}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            ) : (
              <iframe
                src={`${documentUrl}#page=${page}`}
                title={`${document.fileName}, page ${page}`}
                className="h-[70vh] w-full border-0"
              />
            )
          ) : (
            <article className="space-y-3 p-6">
              <header className="border-b border-neutral-200 pb-2">
                <p className="text-xs text-neutral-500">
                  {document.fileName} · page {page} of {document.pageCount} · version{' '}
                  {document.currentVersion}
                </p>
              </header>
              <p className="text-sm leading-relaxed text-neutral-800">
                {pageText.length > 0 ? pageText : 'This page has no extractable text layer.'}
              </p>
              <p className="text-xs text-neutral-500">
                Text layer preview — the signed file is rendered above when the document service
                provides a download URL.
              </p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
