'use client';

import { useState } from 'react';
import { usePatientCommunications } from '@/lib/queries/useCommunications';
import { CommunicationEntry } from './CommunicationEntry';
import { LogCommunicationForm } from './LogCommunicationForm';

interface Props {
  patientId: string;
}

export function CommunicationTimeline({ patientId }: Props) {
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError } = usePatientCommunications(patientId, { page, limit: 10 });

  const logs = data?.data ?? [];
  const meta = data?.meta;
  const hasMore = meta ? page < meta.totalPages : false;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Communications</h3>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
        >
          + Log Communication
        </button>
      </div>

      {/* Log form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h4 className="text-lg font-semibold mb-4">Log Communication</h4>
            <LogCommunicationForm patientId={patientId} onClose={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <p className="text-sm text-red-600">Failed to load communications.</p>
      )}

      {/* Empty */}
      {!isLoading && !isError && logs.length === 0 && (
        <p className="text-sm text-gray-500 py-8 text-center">No communications on record.</p>
      )}

      {/* List */}
      {!isLoading && logs.length > 0 && (
        <div className="space-y-3">
          {logs.map((log) => (
            <CommunicationEntry key={log._id} log={log} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="text-sm text-indigo-600 hover:underline"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
