'use client';

import { useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

interface Cosigner {
  id: string;
  name: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  signedAt?: string;
  comments?: string;
}

interface CosignatureWorkflowProps {
  encounterId: string;
  cosigners: Cosigner[];
  onCosignRequested?: () => void;
  onStatusChange?: (status: 'approved' | 'rejected') => void;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700';
    case 'rejected':
      return 'bg-red-100 text-red-700';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function CosignatureWorkflow({
  encounterId,
  cosigners = [],
  onCosignRequested,
  onStatusChange,
}: CosignatureWorkflowProps) {
  const [isRequestingSign, setIsRequestingSign] = useState(false);
  const [selectedCosigner, setSelectedCosigner] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const pendingCount = cosigners.filter((c) => c.status === 'pending').length;
  const approvedCount = cosigners.filter((c) => c.status === 'approved').length;
  const rejectedCount = cosigners.filter((c) => c.status === 'rejected').length;

  const handleRequestSign = async () => {
    setIsRequestingSign(true);
    try {
      await fetchWithAuth(
        `${API_V1}/encounters/${encodeURIComponent(encounterId)}/request-cosign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cosignersToRequest: cosigners.filter((c) => c.status === 'pending').map((c) => c.id),
          }),
        }
      );
      onCosignRequested?.();
    } finally {
      setIsRequestingSign(false);
    }
  };

  const handleApproveCosign = async (cosignerId: string) => {
    try {
      await fetchWithAuth(
        `${API_V1}/encounters/${encodeURIComponent(encounterId)}/cosign/${encodeURIComponent(cosignerId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved', comments: feedback }),
        }
      );
      setFeedback('');
      setSelectedCosigner(null);
      onStatusChange?.('approved');
    } catch (error) {
      console.error('Failed to approve cosign:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
          <p className="text-2xl font-bold text-yellow-700">{pendingCount}</p>
          <p className="text-xs font-semibold uppercase text-yellow-600">Pending</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{approvedCount}</p>
          <p className="text-xs font-semibold uppercase text-green-600">Approved</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{rejectedCount}</p>
          <p className="text-xs font-semibold uppercase text-red-600">Rejected</p>
        </div>
      </div>

      <div className="space-y-2">
        {cosigners.map((cosigner) => (
          <div
            key={cosigner.id}
            className={`rounded-md border p-3 transition-colors ${
              selectedCosigner === cosigner.id
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{cosigner.name}</p>
                <p className="text-xs text-gray-500">{cosigner.title}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(cosigner.status)}`}
              >
                {cosigner.status}
              </span>
            </div>

            {cosigner.signedAt && (
              <p className="mb-2 text-xs text-gray-500">Signed: {formatDate(cosigner.signedAt)}</p>
            )}

            {cosigner.comments && (
              <div className="mb-2 rounded border border-gray-100 bg-white p-2">
                <p className="mb-1 text-xs font-semibold text-gray-600">Comments:</p>
                <p className="text-sm text-gray-700">{cosigner.comments}</p>
              </div>
            )}

            {cosigner.status === 'pending' && selectedCosigner === cosigner.id && (
              <div className="space-y-2 border-t border-gray-200 pt-2">
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Add comments (optional)"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveCosign(cosigner.id)}
                    className="flex-1 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setSelectedCosigner(null)}
                    className="flex-1 rounded bg-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {cosigner.status === 'pending' && selectedCosigner !== cosigner.id && (
              <button
                onClick={() => setSelectedCosigner(cosigner.id)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Review & Sign
              </button>
            )}
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <button
          onClick={handleRequestSign}
          disabled={isRequestingSign}
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isRequestingSign ? 'Sending requests...' : 'Send cosign requests to pending reviewers'}
        </button>
      )}
    </div>
  );
}
