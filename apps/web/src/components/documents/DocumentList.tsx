'use client';

import { Badge, Button, EmptyState } from '@/components/ui';
import type { Document } from './DocumentViewer';

const TYPE_LABELS: Record<string, string> = {
  lab_result: 'Lab Result',
  referral_letter: 'Referral Letter',
  consent_form: 'Consent Form',
  medical_image: 'Medical Image',
  other: 'Other',
};

function mimeIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  return '📁';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentListProps {
  documents: Document[];
  onView: (doc: Document) => void;
}

export function DocumentList({ documents, onView }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <EmptyState
        title="No documents"
        description="Upload a document to get started."
      />
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
      {documents.map((doc) => (
        <li key={doc._id} className="flex items-center gap-3 py-3">
          <span className="text-2xl leading-none">{mimeIcon(doc.mimeType)}</span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {doc.fileName}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{TYPE_LABELS[doc.documentType] ?? doc.documentType}</span>
              <span>{formatBytes(doc.sizeBytes)}</span>
              {doc.versionCount > 1 && <span>v{doc.currentVersion}</span>}
              <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <Badge variant={doc.versionCount > 1 ? 'primary' : 'default'}>
            {doc.versionCount > 1 ? `${doc.versionCount} versions` : 'v1'}
          </Badge>

          <Button variant="ghost" size="sm" onClick={() => onView(doc)}>
            View
          </Button>
        </li>
      ))}
    </ul>
  );
}
