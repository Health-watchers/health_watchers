'use client';

import { useRef, useState } from 'react';
import { API_URL } from '@/lib/api';

interface ImportError {
  row: number;
  field: string;
  error: string;
}

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
}

const CSV_TEMPLATE =
  'firstName,lastName,dateOfBirth,sex,contactNumber,address\nJohn,Doe,1990-01-15,M,+2348012345678,"123 Main St, Lagos"';

export default function PatientImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'patients-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('uploading');
    setResult(null);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_URL}/api/v1/patients/import`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.message || 'Import failed');
        setStatus('error');
      } else {
        setResult(json.data);
        setStatus('done');
      }
    } catch {
      setErrorMsg('Network error — please try again');
      setStatus('error');
    } finally {
      // Reset input so the same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Bulk CSV Import</h2>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Download Template
        </button>

        <label className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          {status === 'uploading' ? 'Uploading…' : 'Import CSV'}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={status === 'uploading'}
            onChange={handleFileChange}
            aria-label="Upload CSV file"
          />
        </label>
      </div>

      {status === 'uploading' && (
        <p className="mt-3 text-sm text-gray-500" role="status" aria-live="polite">
          Processing import, please wait…
        </p>
      )}

      {status === 'error' && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}

      {status === 'done' && result && (
        <div className="mt-4 space-y-2 text-sm" role="status" aria-live="polite">
          <div className="flex gap-4">
            <span className="text-gray-600">Total: <strong>{result.total}</strong></span>
            <span className="text-green-700">Imported: <strong>{result.imported}</strong></span>
            <span className="text-yellow-700">Skipped: <strong>{result.skipped}</strong></span>
            <span className="text-red-700">Errors: <strong>{result.errors.length}</strong></span>
          </div>

          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-600 hover:underline">
                Show {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
              </summary>
              <ul className="mt-2 max-h-48 overflow-y-auto rounded border border-red-200 bg-red-50 p-2 text-xs">
                {result.errors.map((e, i) => (
                  <li key={i} className="py-0.5">
                    Row {e.row} — <span className="font-medium">{e.field}</span>: {e.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
