'use client';

import { useState } from 'react';
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
}

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
}: Props) {
  const [result, setResult] = useState<DifferentialResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set());

  const getSuggestions = async () => {
    if (!chiefComplaint.trim()) {
      setError('Please enter a chief complaint first.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

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
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get AI suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDiagnosis = (item: DifferentialItem) => {
    if (onAddDiagnosis) {
      onAddDiagnosis(item);
      setAddedCodes((prev) => new Set(prev).add(item.icdCode));
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
          onClick={getSuggestions}
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
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
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
              {result.differentials.map((item) => (
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
                        {item.probability} probability
                      </span>
                    </div>

                    {onAddDiagnosis && (
                      <button
                        onClick={() => handleAddDiagnosis(item)}
                        disabled={addedCodes.has(item.icdCode)}
                        className="shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-default disabled:border-green-300 disabled:text-green-700"
                        aria-label={
                          addedCodes.has(item.icdCode)
                            ? `${item.diagnosis} already added`
                            : `Add ${item.diagnosis} to encounter`
                        }
                      >
                        {addedCodes.has(item.icdCode) ? '✓ Added' : '+ Add to Encounter'}
                      </button>
                    )}
                  </div>

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
              ))}
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
            Enter a chief complaint and click "Get AI Suggestions" to see differential diagnoses.
          </p>
        )}
      </div>
    </div>
  );
}
