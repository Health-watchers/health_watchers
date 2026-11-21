'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export interface DifferentialItem {
  diagnosis: string;
  icdCode: string;
  probability: 'high' | 'medium' | 'low';
  reasoning: string;
  recommendedTests: string[];
}

export interface DifferentialResult {
  differentials: DifferentialItem[];
  urgency: 'routine' | 'urgent' | 'emergency';
  disclaimer: string;
}

interface Props {
  chiefComplaint: string;
  symptoms?: string[];
  vitalSigns?: {
    heartRate?: number;
    bloodPressure?: string;
    oxygenSaturation?: number;
    temperature?: number;
  };
  patientAge?: number;
  patientSex?: string;
  relevantHistory?: string;
  onAddDiagnosis?: (item: DifferentialItem) => void;
  onReject?: (item: DifferentialItem) => void;
  /** Debounce delay (ms) for real-time suggestions. */
  debounceMs?: number;
}

export type SuggestionDecision = 'accepted' | 'rejected' | 'modified';

const PROBABILITY_STYLES: Record<DifferentialItem['probability'], string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

const URGENCY_STYLES: Record<DifferentialResult['urgency'], string> = {
  emergency: 'bg-red-600 text-white',
  urgent: 'bg-orange-500 text-white',
  routine: 'bg-green-600 text-white',
};

export default function DifferentialDiagnosisPanel({
  chiefComplaint,
  symptoms = [],
  vitalSigns,
  patientAge,
  patientSex,
  relevantHistory,
  onAddDiagnosis,
  onReject,
  debounceMs = 800,
}: Props) {
  const [result, setResult] = useState<DifferentialResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decidedCodes, setDecidedCodes] = useState<Map<string, SuggestionDecision>>(new Map());
  const [flaggedCodes, setFlaggedCodes] = useState<Set<string>>(new Set());
  const [modifyingCode, setModifyingCode] = useState<string | null>(null);
  const [modifyValue, setModifyValue] = useState('');
  const requestIdRef = useRef(0);

  const getSuggestions = useCallback(async () => {
    if (!chiefComplaint.trim()) {
      setError('Please enter a chief complaint first.');
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`${API_V1}/ai/differential-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chiefComplaint,
          symptoms: symptoms.length > 0 ? symptoms : [chiefComplaint],
          vitalSigns,
          patientAge,
          patientSex,
          relevantHistory,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Request failed (${res.status})`);
      }

      const data = await res.json();
      // Ignore stale responses from superseded requests.
      if (requestId !== requestIdRef.current) return;
      setResult(data);
      setDecidedCodes(new Map());
      setFlaggedCodes(new Set());
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to get AI suggestions');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [chiefComplaint, symptoms, vitalSigns, patientAge, patientSex, relevantHistory]);

  // Real-time suggestions: debounce changes to the incoming SOAP/chief-complaint text.
  useEffect(() => {
    if (!chiefComplaint.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      void getSuggestions();
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [chiefComplaint, debounceMs, getSuggestions]);

  const logDecision = async (
    item: DifferentialItem,
    decision: SuggestionDecision,
    modifiedDiagnosis?: string,
  ) => {
    try {
      await fetchWithAuth(`${API_V1}/ai/differential-diagnosis/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosis: item.diagnosis,
          icdCode: item.icdCode,
          probability: item.probability,
          decision,
          modifiedDiagnosis,
          chiefComplaint,
        }),
      });
    } catch {
      // Decision logging is best-effort; never block the clinician.
    }
  };

  const handleAccept = (item: DifferentialItem) => {
    setDecidedCodes((prev) => new Map(prev).set(item.icdCode, 'accepted'));
    void logDecision(item, 'accepted');
    onAddDiagnosis?.(item);
  };

  const handleReject = (item: DifferentialItem) => {
    setDecidedCodes((prev) => new Map(prev).set(item.icdCode, 'rejected'));
    void logDecision(item, 'rejected');
    onReject?.(item);
  };

  const startModify = (item: DifferentialItem) => {
    setModifyingCode(item.icdCode);
    setModifyValue(item.diagnosis);
  };

  const cancelModify = () => {
    setModifyingCode(null);
    setModifyValue('');
  };

  const confirmModify = (item: DifferentialItem) => {
    const trimmed = modifyValue.trim();
    if (!trimmed) return;
    setDecidedCodes((prev) => new Map(prev).set(item.icdCode, 'modified'));
    void logDecision(item, 'modified', trimmed);
    onAddDiagnosis?.({ ...item, diagnosis: trimmed });
    cancelModify();
  };

  const handleFeedback = async (item: DifferentialItem) => {
    setFlaggedCodes((prev) => new Set(prev).add(item.icdCode));
    try {
      await fetchWithAuth(`${API_V1}/ai/differential-diagnosis/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diagnosis: item.diagnosis,
          icdCode: item.icdCode,
          chiefComplaint,
          reason: 'incorrect_suggestion',
        }),
      });
    } catch {
      // Feedback is best-effort.
    }
  };

  return (
    <div className="rounded-xl border border-blue-100 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white">
            CLINICAL AI
          </span>
          <span className="text-sm font-semibold text-gray-800">Differential Diagnosis</span>
        </div>
        <button
          onClick={() => void getSuggestions()}
          disabled={loading || !chiefComplaint.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Get AI differential diagnosis suggestions"
        >
          {loading ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Analysing…
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Get AI Suggestions
            </>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3" aria-live="polite" aria-label="Loading differential diagnosis">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                  <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
                </div>
                <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                <div className="mt-1 h-3 w-4/5 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-4">
            {/* Urgency badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Urgency:
              </span>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide ${URGENCY_STYLES[result.urgency]}`}
              >
                {result.urgency}
              </span>
            </div>

            {/* Differentials list */}
            <ul className="space-y-3" aria-label="Differential diagnoses">
              {result.differentials.map((item) => {
                const decision = decidedCodes.get(item.icdCode);
                const isFlagged = flaggedCodes.has(item.icdCode);
                return (
                  <li
                    key={item.icdCode}
                    className="rounded-lg border border-gray-100 bg-gray-50 p-4 transition-colors hover:bg-blue-50/40"
                  >
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{item.diagnosis}</span>
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                          {item.icdCode}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${PROBABILITY_STYLES[item.probability]}`}
                        >
                          {item.probability} confidence
                        </span>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => handleAccept(item)}
                          disabled={decision === 'accepted'}
                          className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 disabled:cursor-default disabled:opacity-60"
                          aria-label={`Accept ${item.diagnosis}`}
                        >
                          {decision === 'accepted' ? '✓ Accepted' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleReject(item)}
                          disabled={decision === 'rejected'}
                          className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-default disabled:opacity-60"
                          aria-label={`Reject ${item.diagnosis}`}
                        >
                          {decision === 'rejected' ? '✕ Rejected' : 'Reject'}
                        </button>
                        <button
                          onClick={() => startModify(item)}
                          className="rounded-md border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
                          aria-label={`Modify ${item.diagnosis}`}
                        >
                          Modify
                        </button>
                        <button
                          onClick={() => void handleFeedback(item)}
                          disabled={isFlagged}
                          className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-default disabled:opacity-60"
                          aria-label={`Flag ${item.diagnosis} as incorrect`}
                        >
                          {isFlagged ? '⚑ Flagged' : '⚑ Flag'}
                        </button>
                      </div>
                    </div>

                    {modifyingCode === item.icdCode && (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={modifyValue}
                          onChange={(e) => setModifyValue(e.target.value)}
                          className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                          aria-label={`Modified diagnosis for ${item.diagnosis}`}
                        />
                        <button
                          onClick={() => confirmModify(item)}
                          disabled={!modifyValue.trim()}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelModify}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <p className="mb-2 text-sm text-gray-600">{item.reasoning}</p>

                    {item.recommendedTests.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-xs font-medium text-gray-500">Recommended tests:</span>
                        {item.recommendedTests.map((test) => (
                          <span
                            key={test}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                          >
                            {test}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Disclaimer */}
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ {result.disclaimer}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <p className="py-4 text-center text-sm text-gray-400">
            Enter a chief complaint or SOAP notes to see real-time differential diagnoses.
          </p>
        )}
      </div>
    </div>
  );
}
