'use client';

import { useState } from 'react';
import { Badge, Button, Input, Select, Textarea } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { annotationSummary, annotationsForDocument, createAnnotation } from '@/lib/documents/annotations';
import type {
  AnnotationType,
  DocumentAnnotation,
  DocumentRecord,
} from '@/lib/documents/types';

export interface DocumentAnnotationPanelProps {
  document: DocumentRecord;
  annotations: readonly DocumentAnnotation[];
  currentPage: number;
  actor: string;
  onCreate: (annotation: DocumentAnnotation) => void;
  onDelete: (annotationId: string) => void;
}

const TYPE_OPTIONS: { value: AnnotationType; label: string }[] = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'note', label: 'Note' },
];

/** Issue #1316 — document annotations. */
export function DocumentAnnotationPanel({
  document,
  annotations,
  currentPage,
  actor,
  onCreate,
  onDelete,
}: DocumentAnnotationPanelProps) {
  const [type, setType] = useState<AnnotationType>('highlight');
  const [quote, setQuote] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const documentAnnotations = annotationsForDocument(annotations, document.id);
  const pageAnnotations = documentAnnotations.filter(
    (annotation) => annotation.page === currentPage
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (type === 'highlight' && quote.trim().length === 0) {
      setError('Enter the text to highlight.');
      return;
    }
    if (type === 'note' && text.trim().length === 0) {
      setError('Enter the note text.');
      return;
    }
    setError(null);
    onCreate(
      createAnnotation({
        documentId: document.id,
        page: currentPage,
        type,
        quote,
        text,
        createdBy: actor,
      })
    );
    setQuote('');
    setText('');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3" aria-label="Add annotation">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Annotation type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(event) => setType(event.target.value as AnnotationType)}
          />
          <Input label="Page" type="number" min={1} max={document.pageCount} value={String(currentPage)} disabled readOnly />
        </div>

        {type === 'highlight' ? (
          <Input
            label="Text to highlight *"
            placeholder="e.g. warfarin 5 mg once daily"
            value={quote}
            onChange={(event) => setQuote(event.target.value)}
          />
        ) : (
          <Textarea
            label="Note *"
            rows={3}
            placeholder="What should the next person know about this page?"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}

        {error && (
          <p role="alert" className="text-danger-600 dark:text-danger-400 text-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="sm">
            Add to page {currentPage}
          </Button>
        </div>
      </form>

      <div>
        <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          Annotations on page {currentPage} ({pageAnnotations.length})
        </h4>
        {pageAnnotations.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Nothing on this page yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pageAnnotations.map((annotation) => (
              <li
                key={annotation.id}
                className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={annotation.type === 'highlight' ? 'warning' : 'primary'}>
                    {annotation.type === 'highlight' ? 'Highlight' : 'Note'}
                  </Badge>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {annotation.createdBy} · {formatDateTime(annotation.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
                  {annotationSummary(annotation)}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(annotation.id)}
                  className="mt-1"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {documentAnnotations.length > pageAnnotations.length && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {documentAnnotations.length - pageAnnotations.length} more annotation
          {documentAnnotations.length - pageAnnotations.length === 1 ? '' : 's'} on other pages.
        </p>
      )}
    </div>
  );
}
