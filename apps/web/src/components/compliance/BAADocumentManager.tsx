'use client';

import { useState } from 'react';
import type { BAADocument } from './types';

interface BAADocumentManagerProps {
  documents?: BAADocument[];
  onUpload?: (document: File) => Promise<void>;
}

export function BAADocumentManager({ documents = [], onUpload }: BAADocumentManagerProps) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;

    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Business Associate Agreements</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Manage and track BAA documents
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-600">
        <input
          type="file"
          onChange={handleUpload}
          disabled={isUploading}
          className="hidden"
          id="baa-upload"
          accept=".pdf,.doc,.docx"
        />
        <label
          htmlFor="baa-upload"
          className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          {isUploading ? 'Uploading...' : 'Upload BAA Document'}
        </label>
      </div>

      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-neutral-900 dark:text-neutral-100">Documents</h4>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
              >
                <div className="flex-1">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">{doc.name}</p>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    v{doc.version} • {doc.status} • Updated{' '}
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button className="ml-2 rounded px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  View
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
