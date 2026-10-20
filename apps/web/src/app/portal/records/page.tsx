'use client';

import { useEffect, useState } from 'react';
import { portalGet } from '@/lib/portalApi';
import { API_URL } from '@/lib/api';

interface PatientRecord {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  systemId: string;
}

export default function PortalRecordsPage() {
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalGet<PatientRecord>('/me')
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;
  if (!record) return <p className="text-red-500 dark:text-red-400">Could not load your records.</p>;

  const downloadUrl = `${API_URL}/api/v1/export/patient/${record._id}/pdf`;

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
