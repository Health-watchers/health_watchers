'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, Spinner } from '@/components/ui';

export interface Document {
  _id: string;
  fileName: string;
  mimeType: string;
  documentType: string;
  sizeBytes: number;
  currentVersion: number;
  versionCount: number;
  createdAt: string;
}

interface DocumentViewerProps {
  document: Document | null;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentViewer({ document, onClose }: DocumentViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!document) { setUrl(null); return; }

    setLoading(true);
    setError(null);

    fetch(`/api/v1/documents/${document._id}/download`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`)))
      .then((data) => setUrl(data.data?.url ?? null))
      .catch((err) => setError(err.message ?? 'Failed to load document'))
      .finally(() => setLoading(false));
  }, [document]);

  if (!document) return null;

  const isImage = document.mimeType.startsWith('image/');
  const isPdf = document.mimeType === 'application/pdf';

  return (
    <Modal
      isOpen={!!document}
      onClose={onClose}
      title={document.fileName}
      size="lg"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          <span>Type: <span className="capitalize">{document.documentType.replace(/_/g, ' ')}</span></span>
          <span>Size: {formatBytes(document.sizeBytes)}</span>
          <span>Version: {document.currentVersion} of {document.versionCount}</span>
          <span>Uploaded: {new Date(document.createdAt).toLocaleDateString()}</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {error && (
          <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>
        )}

        {url && !loading && (
          <div className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
            {isPdf && (
              <iframe
                src={url}
                className="w-full h-[60vh]"
                title={document.fileName}
              />
            )}
            {isImage && (
              <img
                src={url}
                alt={document.fileName}
                className="w-full max-h-[60vh] object-contain bg-neutral-50 dark:bg-neutral-900"
              />
            )}
            {!isPdf && !isImage && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Preview not available for this file type.
                </p>
                <Button variant="outline" onClick={() => window.open(url, '_blank')}>
                  Download File
                </Button>
              </div>
            )}
          </div>
        )}

        {url && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => window.open(url, '_blank')}>
              Open in New Tab
            </Button>
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
