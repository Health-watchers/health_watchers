'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui';

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'application/dicom', 'application/octet-stream']);
const ALLOWED_EXTS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.dcm']);
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

export interface DocumentUploadZoneProps {
  patientId: string;
  clinicId: string;
  onUploaded: () => void;
}

function validateFile(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  if (!ALLOWED_EXTS.has(ext) && !ALLOWED_TYPES.has(file.type)) {
    return 'Only PDF, JPEG, PNG, and DICOM files are allowed.';
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'File exceeds the 20 MB limit.';
  }
  return null;
}

const DOCUMENT_TYPES = ['lab_result', 'referral_letter', 'consent_form', 'medical_image', 'other'] as const;
type DocumentType = typeof DOCUMENT_TYPES[number];

export function DocumentUploadZone({ patientId, clinicId, onUploaded }: DocumentUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocumentType>('other');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const picked = files[0];
    const err = validateFile(picked);
    if (err) {
      setFileError(err);
      setFile(null);
    } else {
      setFileError(null);
      setFile(picked);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('patientId', patientId);
      form.append('clinicId', clinicId);
      form.append('documentType', docType);

      const res = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Upload failed (${res.status})`);
      }

      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded();
    } catch (err: any) {
      setUploadError(err.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={[
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
          dragging
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-neutral-300 hover:border-primary-400 dark:border-neutral-600',
        ].join(' ')}
      >
        <svg className="mb-3 h-10 w-10 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {file ? file.name : 'Drag & drop a file, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-neutral-500">PDF, JPEG, PNG, DICOM — max 20 MB</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.dcm"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {fileError && (
        <p className="text-sm text-danger-600 dark:text-danger-400">{fileError}</p>
      )}

      {file && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
              className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex-shrink-0 pt-6">
            <Button onClick={handleUpload} loading={uploading} disabled={uploading}>
              Upload
            </Button>
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-sm text-danger-600 dark:text-danger-400">{uploadError}</p>
      )}
    </div>
  );
}
