import type { AnnotationType, DocumentAnnotation, DocumentRecord } from './types';

let annotationCounter = 0;

/** Stable-enough client id; the API assigns the durable id on persist. */
export function makeAnnotationId(): string {
  annotationCounter += 1;
  return `ann-${Date.now().toString(36)}-${annotationCounter}`;
}

export function createAnnotation(input: {
  documentId: string;
  page: number;
  type: AnnotationType;
  text: string;
  quote: string;
  createdBy: string;
  createdAt?: string;
}): DocumentAnnotation {
  return {
    id: makeAnnotationId(),
    documentId: input.documentId,
    page: input.page,
    type: input.type,
    text: input.text.trim(),
    quote: input.quote.trim(),
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function annotationsForDocument(
  annotations: readonly DocumentAnnotation[],
  documentId: string
): DocumentAnnotation[] {
  return annotations
    .filter((annotation) => annotation.documentId === documentId)
    .slice()
    .sort((a, b) => a.page - b.page || a.createdAt.localeCompare(b.createdAt));
}

export function annotationsForPage(
  annotations: readonly DocumentAnnotation[],
  documentId: string,
  page: number
): DocumentAnnotation[] {
  return annotationsForDocument(annotations, documentId).filter(
    (annotation) => annotation.page === page
  );
}

/** Annotation counts indexed by page, used for the thumbnail badges. */
export function annotationCounts(
  annotations: readonly DocumentAnnotation[],
  document: DocumentRecord
): number[] {
  const counts = new Array<number>(document.pageCount).fill(0);
  for (const annotation of annotationsForDocument(annotations, document.id)) {
    if (annotation.page >= 1 && annotation.page <= document.pageCount) {
      counts[annotation.page - 1] = (counts[annotation.page - 1] ?? 0) + 1;
    }
  }
  return counts;
}

export function annotationSummary(annotation: DocumentAnnotation): string {
  return annotation.type === 'highlight'
    ? `Highlighted “${annotation.quote}”`
    : `Note: ${annotation.text}`;
}
