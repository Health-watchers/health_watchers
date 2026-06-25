'use client';

import { useEffect, useState, useCallback } from 'react';
import { portalGet, portalFetch } from '@/lib/portalApi';

interface PatientNote {
  _id: string;
  note: string;
  createdAt: string;
}

interface Encounter {
  _id: string;
  chiefComplaint: string;
  status: string;
  type: string;
  diagnosis?: Array<{ code: string; description: string }>;
  followUpDate?: string;
  patientFriendlySummary: string | null;
  patientNotes: PatientNote[];
  createdAt: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  closed: 'bg-green-100 text-green-700',
  'follow-up': 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
  pending_cosignature: 'bg-purple-100 text-purple-700',
};

export default function PortalEncountersPage() {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [meta, setMeta] = useState<PaginatedResponse<Encounter>['meta'] | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await portalGet<PaginatedResponse<Encounter>>(`/encounters?page=${p}&limit=10`);
      setEncounters(res.data);
      setMeta(res.meta);
    } catch {
      // handled by portalGet redirect on 401
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [page, load]);

  const submitNote = async (encounterId: string) => {
    const note = noteInputs[encounterId]?.trim();
    if (!note) return;
    setSubmitting(encounterId);
    try {
      const res = await portalFetch(`/encounters/${encounterId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      const json = await res.json();
      setEncounters((prev) =>
        prev.map((e) =>
          e._id === encounterId ? { ...e, patientNotes: json.data.patientNotes } : e
        )
      );
      setNoteInputs((prev) => ({ ...prev, [encounterId]: '' }));
    } catch {
      alert('Could not save your note. Please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">My Encounter History</h1>

      {encounters.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-gray-400">No encounters on record yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {encounters.map((encounter) => (
            <article
              key={encounter._id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Header row */}
              <button
                className="w-full flex items-start justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId((prev) => (prev === encounter._id ? null : encounter._id))}
                aria-expanded={expandedId === encounter._id}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{encounter.chiefComplaint}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(encounter.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                    {encounter.type && (
                      <span className="ml-2 capitalize text-gray-400">· {encounter.type}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[encounter.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {encounter.status.replace('_', ' ')}
                  </span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${expandedId === encounter._id ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {expandedId === encounter._id && (
                <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
                  {/* AI summary */}
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white">
                        AI
                      </span>
                      <span className="text-sm font-medium text-gray-700">Visit Summary</span>
                    </div>
                    {encounter.patientFriendlySummary ? (
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {encounter.patientFriendlySummary}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">
                        Summary not yet available for this visit.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      AI-generated summary for informational purposes only.
                    </p>
                  </div>

                  {/* Diagnosis */}
                  {encounter.diagnosis && encounter.diagnosis.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Diagnosis
                      </p>
                      <ul className="space-y-1">
                        {encounter.diagnosis.map((d) => (
                          <li key={d.code} className="text-sm text-gray-700">
                            {d.description}{' '}
                            <span className="text-xs text-gray-400">({d.code})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Follow-up */}
                  {encounter.followUpDate && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                        Follow-up Date
                      </p>
                      <p className="text-sm text-gray-700">
                        {new Date(encounter.followUpDate).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  )}

                  {/* Patient notes */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      My Notes & Questions
                    </p>
                    {encounter.patientNotes.length > 0 ? (
                      <ul className="space-y-2 mb-3">
                        {encounter.patientNotes.map((n) => (
                          <li
                            key={n._id}
                            className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2"
                          >
                            <p className="text-sm text-gray-700">{n.note}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400 mb-3">No notes yet.</p>
                    )}

                    {/* Add note form */}
                    <div className="flex gap-2">
                      <textarea
                        value={noteInputs[encounter._id] ?? ''}
                        onChange={(e) =>
                          setNoteInputs((prev) => ({ ...prev, [encounter._id]: e.target.value }))
                        }
                        placeholder="Add a note or question about this visit…"
                        maxLength={1000}
                        rows={2}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="Add a note or question"
                      />
                      <button
                        onClick={() => submitNote(encounter._id)}
                        disabled={submitting === encounter._id || !noteInputs[encounter._id]?.trim()}
                        className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting === encounter._id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} total
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={!meta.hasPrevPage}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!meta.hasNextPage}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
