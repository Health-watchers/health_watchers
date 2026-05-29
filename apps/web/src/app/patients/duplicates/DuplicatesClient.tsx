'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

interface PatientSummary {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  contactNumber?: string;
}

interface DuplicatePair {
  patientA: PatientSummary;
  patientB: PatientSummary;
  confidence: number;
  matchReasons: string[];
}

function confidenceVariant(score: number): 'danger' | 'warning' | 'success' {
  if (score >= 85) return 'danger';
  if (score >= 70) return 'warning';
  return 'success';
}

async function fetchPairs(minConfidence: number): Promise<DuplicatePair[]> {
  const res = await fetchWithAuth(
    `${API_V1}/patients/potential-duplicates?minConfidence=${minConfidence}`
  );
  if (!res.ok) throw new Error(`Failed to load duplicates (${res.status})`);
  const json = await res.json();
  return json.data ?? [];
}

async function mergePair(primaryId: string, duplicateId: string): Promise<void> {
  const res = await fetchWithAuth(`${API_V1}/patients/${primaryId}/merge/${duplicateId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Merge failed (${res.status})`);
  }
}

function PatientCard({ patient }: { patient: PatientSummary }) {
  return (
    <div className="rounded border border-gray-200 p-3 text-sm">
      <p className="font-semibold text-gray-900">
        {patient.firstName} {patient.lastName}
      </p>
      <p className="text-gray-500 text-xs">{patient.systemId}</p>
      <p className="text-gray-600">DOB: {patient.dateOfBirth}</p>
      {patient.contactNumber && (
        <p className="text-gray-600">Phone: {patient.contactNumber}</p>
      )}
      <Link
        href={`/patients/${patient._id}`}
        className="mt-1 inline-block text-blue-600 hover:underline text-xs"
        target="_blank"
      >
        View record ↗
      </Link>
    </div>
  );
}

export default function DuplicatesClient() {
  const qc = useQueryClient();
  const [minConfidence, setMinConfidence] = useState(60);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mergeError, setMergeError] = useState<string | null>(null);

  const { data: pairs = [], isLoading, error, refetch } = useQuery({
    queryKey: ['potential-duplicates', minConfidence],
    queryFn: () => fetchPairs(minConfidence),
  });

  const { mutate: doMerge, isPending: merging } = useMutation({
    mutationFn: ({ primaryId, dupId }: { primaryId: string; dupId: string }) =>
      mergePair(primaryId, dupId),
    onSuccess: () => {
      setMergeError(null);
      qc.invalidateQueries({ queryKey: ['potential-duplicates'] });
    },
    onError: (e: Error) => setMergeError(e.message),
  });

  const visible = pairs.filter(
    (p) => !dismissed.has(`${p.patientA._id}-${p.patientB._id}`)
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Potential Duplicate Patients</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and resolve duplicate patient records. Merging keeps the primary record and
            redirects the duplicate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="min-confidence" className="text-sm text-gray-600 whitespace-nowrap">
            Min confidence:
          </label>
          <select
            id="min-confidence"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {[50, 60, 70, 80, 90].map((v) => (
              <option key={v} value={v}>{v}%</option>
            ))}
          </select>
        </div>
      </div>

      {mergeError && (
        <div role="alert" className="mb-4 rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {mergeError}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : error ? (
        <div className="rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load duplicates.{' '}
          <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-6 py-12 text-center text-gray-500">
          No potential duplicates found at {minConfidence}% confidence threshold.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{visible.length} pair(s) found</p>
          {visible.map((pair) => {
            const key = `${pair.patientA._id}-${pair.patientB._id}`;
            return (
              <div
                key={key}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Badge variant={confidenceVariant(pair.confidence)}>
                    {pair.confidence}% confidence
                  </Badge>
                  <span className="text-xs text-gray-400">
                    {pair.matchReasons.join(' · ')}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Patient A (keep as primary)
                    </p>
                    <PatientCard patient={pair.patientA} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Patient B (will be merged)
                    </p>
                    <PatientCard patient={pair.patientB} />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={merging}
                    onClick={() =>
                      doMerge({ primaryId: pair.patientA._id, dupId: pair.patientB._id })
                    }
                  >
                    Merge B → A
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={merging}
                    onClick={() =>
                      doMerge({ primaryId: pair.patientB._id, dupId: pair.patientA._id })
                    }
                  >
                    Merge A → B
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDismissed((prev) => new Set([...prev, key]))}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
