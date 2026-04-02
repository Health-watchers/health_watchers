"use client";

import { useState, useEffect } from "react";

interface AiSummaryCardProps {
  patientName: string;
  encounterId: string;
  initialSummary?: string;
  tags?: string[];
}

export default function AiSummaryCard({
  patientName,
  encounterId,
  initialSummary,
  tags = [],
}: AiSummaryCardProps) {
  const [summary, setSummary] = useState<string | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(!initialSummary);

  const generateSummary = () => {
    setLoading(true);
    setSummary(null);
    // Simulate AI generation delay
    setTimeout(() => {
      setSummary(
        initialSummary ??
          `${patientName} presents with a focused complaint pattern across recent visits. AI review suggests conservative management is appropriate with close follow-up and escalation to imaging if symptoms persist or worsen.`,
      );
      setLoading(false);
    }, 1800);
  };

  useEffect(() => {
    if (!initialSummary) {
      generateSummary();
    }
  }, [encounterId, initialSummary, patientName]);

  return (
    <div className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white">
            CLINICAL AI
          </span>
          <span className="text-sm font-semibold text-gray-800">
            Intelligent Encounter Summary
          </span>
        </div>
        <button
          onClick={generateSummary}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
        >
          {/* Regenerate icon */}
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M1 4v6h6M23 20v-6h-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Regenerate
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2.5">
          <div className="h-3.5 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 w-[90%] animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 w-[95%] animate-pulse rounded bg-gray-200" />
          <div className="h-3.5 w-[80%] animate-pulse rounded bg-gray-200" />
          <div className="mt-3 flex gap-2">
            <div className="h-5 w-24 animate-pulse rounded-full bg-gray-200" />
            <div className="h-5 w-28 animate-pulse rounded-full bg-gray-200" />
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-gray-600">{summary}</p>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
