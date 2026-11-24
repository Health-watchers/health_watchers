'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalGet, portalPost } from '@/lib/portalApi';
import { API_URL } from '@/lib/api';

interface PatientRecord {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  systemId: string;
}

type ExportFormat = 'json' | 'pdf' | 'csv';

interface ExportRequestResponse {
  status: 'ready' | 'pending';
  downloadUrl?: string;
  expiresAt?: string;
  message?: string;
}

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'json', label: 'JSON (FHIR R4)' },
  { value: 'pdf', label: 'PDF' },
  { value: 'csv', label: 'CSV' },
];

export default function PortalRecordsPage() {
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState<ExportFormat>('json');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportRequestResponse | null>(null);

  useEffect(() => {
    portalGet<PatientRecord>('/me')
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestExport = async () => {
    setExporting(true);
    setExportError(null);
    setExportResult(null);
    try {
      const result = await portalPost<ExportRequestResponse>('/export-request', { format });
      setExportResult(result);
      if (result.status === 'ready' && result.downloadUrl) {
        window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setExportError('Could not start your data export. Please try again later.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;
  if (!record) return <p className="text-red-500 dark:text-red-400">Could not load your records.</p>;

  const downloadUrl = `${API_URL}/api/v1/export/patient/${record._id}/pdf`;
=======

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">My Medical Records</h1>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 font-semibold text-gray-700 dark:text-gray-200">Personal Information</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Full name</dt>
            <dd className="font-medium text-gray-800 dark:text-gray-100">
              {record.firstName} {record.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Patient ID</dt>
            <dd className="font-medium text-gray-800 dark:text-gray-100">{record.systemId}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Date of birth</dt>
            <dd className="font-medium text-gray-800 dark:text-gray-100">{record.dateOfBirth}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Sex</dt>
            <dd className="font-medium text-gray-800 dark:text-gray-100">{record.sex}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="mb-4 font-semibold text-gray-700 dark:text-gray-200">Download my data</h2>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          Export a complete copy of your health data, including demographics, encounters, lab results,
          medications, immunizations and payments.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-500 dark:text-gray-400">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              disabled={exporting}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={requestExport}
            disabled={exporting}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {exporting ? 'Preparing export…' : 'Download my data'}
          </button>
        </div>

        {exportError && (
          <p className="mt-4 text-sm text-red-500 dark:text-red-400">{exportError}</p>
        )}

        {exportResult?.status === 'pending' && (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-200">
            {exportResult.message ??
              'Your export is being prepared. We will email you when it is ready to download.'}
          </p>
        )}

        {exportResult?.status === 'ready' && exportResult.downloadUrl && (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-200">
            Your export is ready.{' '}
            <a
              href={exportResult.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Download now
            </a>
          </p>
        )}

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Download links expire 30 days after they are generated. All data exports are logged in the
          audit trail.
        </p>

        <Link
          href="/portal/records/exports"
          className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          View my export history
        </Link>
      </section>

      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
      >
        Download Records as PDF
      </a>
    </div>
  );
}
