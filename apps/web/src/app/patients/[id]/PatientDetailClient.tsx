'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { type Patient, formatDate } from '@health-watchers/types';
import { ErrorMessage } from '@/components/ui';
import { API_BASE } from '@/lib/api';

interface Encounter {
  _id: string;
  chiefComplaint: string;
  notes?: string;
  createdAt: string;
}

interface Labels {
  back: string;
  loading: string;
  error: string;
  details: string;
  encounters: string;
  noEncounters: string;
}

export default function PatientDetailClient({
  patientId,
  labels,
}: {
  patientId: string;
  labels: Labels;
}) {
  const {
    data: patient,
    isLoading: patientLoading,
    error: patientError,
  } = useQuery({
    queryKey: queryKeys.patients.detail(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/patients/${patientId}`);
      if (!res.ok) throw new Error('Failed to load patient');
      const data = await res.json();
      return data.data;
    },
  });

  const {
    data: encounters = [],
    isLoading: encountersLoading,
    error: encountersError,
  } = useQuery({
    queryKey: queryKeys.encounters.byPatient(patientId),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/encounters/patient/${patientId}`);
      if (!res.ok) throw new Error('Failed to load encounters');
      const data = await res.json();
      return data.data || [];
    },
  });

  const isLoading = patientLoading || encountersLoading;
  const error = patientError || encountersError;

  if (isLoading) {
    return <p className="px-4 py-8 text-gray-500">{labels.loading}</p>;
  }

  if (error || !patient) {
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : labels.error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/patients" className="text-blue-600 hover:underline mb-6 inline-block">
        ← {labels.back}
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {patient.firstName} {patient.lastName}
        </h1>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">System ID</p>
            <p className="text-gray-900">{patient.systemId}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Date of Birth</p>
            <p className="text-gray-900">{formatDate(patient.dateOfBirth)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Sex</p>
            <p className="text-gray-900">{patient.sex}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Contact</p>
            <p className="text-gray-900">{patient.contactNumber || 'N/A'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-gray-500 uppercase font-semibold">Address</p>
            <p className="text-gray-900">{patient.address || 'N/A'}</p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{labels.encounters}</h2>
        {encounters.length === 0 ? (
          <p className="text-gray-500">{labels.noEncounters}</p>
        ) : (
          <div className="space-y-4">
            {encounters.map((e: Encounter) => (
              <div key={e._id} className="bg-white rounded border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase font-semibold">Chief Complaint</p>
                <p className="text-gray-900 font-medium">{e.chiefComplaint}</p>
                {e.notes && (
                  <>
                    <p className="text-xs text-gray-500 uppercase font-semibold mt-2">Notes</p>
                    <p className="text-gray-700">{e.notes}</p>
                  </>
                )}
                <p className="text-xs text-gray-500 mt-2">{formatDate(e.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
