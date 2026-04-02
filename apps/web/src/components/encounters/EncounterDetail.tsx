"use client";

import AiSummaryCard from "./AiSummaryCard";
import type { EncounterRecord } from "./EncounterTable";

interface EncounterDetailProps {
  encounter: EncounterRecord;
  onBack: () => void;
  onEdit?: (encounterId: string) => void;
}

function InfoCard({
  title,
  value,
  unit,
}: {
  title: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function EncounterDetail({
  encounter,
  onBack,
  onEdit,
}: EncounterDetailProps) {
  return (
    <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            className="mb-2 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            ← Back to list
          </button>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Encounter Detail · {encounter.id}
          </p>
          <h2 className="text-3xl font-semibold text-gray-900">
            {encounter.patientName}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            MRN {encounter.patientMrn} · Attending: {encounter.doctor}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {encounter.status}
          </span>
          <button
            onClick={() => onEdit?.(encounter.id)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit Record
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          title="Blood Pressure"
          value={encounter.vitals.bloodPressure}
          unit="mmHg"
        />
        <InfoCard
          title="Heart Rate"
          value={encounter.vitals.heartRate}
          unit="bpm"
        />
        <InfoCard
          title="Temperature"
          value={encounter.vitals.temperature}
          unit="°F"
        />
        <InfoCard title="SpO2" value={encounter.vitals.spo2} unit="%" />
      </div>

      <AiSummaryCard
        encounterId={encounter.id}
        patientName={encounter.patientName}
        initialSummary={encounter.aiSummary}
        tags={["clinical-insight", "encounter-summary"]}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Chief Complaint
            </h3>
            <p className="mt-2 text-gray-800">{encounter.chiefComplaint}</p>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Diagnosis
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-800">
              {encounter.diagnosis.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Treatment Plan
            </h3>
            <p className="mt-2 text-gray-800">{encounter.treatmentPlan}</p>
          </article>
        </div>

        <div className="space-y-4">
          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Prescriptions
            </h3>
            <div className="mt-2 space-y-2">
              {encounter.prescriptions.map((rx) => (
                <div
                  key={rx.name}
                  className="rounded-md border border-gray-200 bg-white p-3"
                >
                  <p className="font-medium text-gray-900">{rx.name}</p>
                  <p className="text-xs text-gray-500">
                    {rx.dose} · {rx.frequency}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
              Follow-up Date
            </h3>
            <p className="mt-2 text-gray-900">
              {formatDate(encounter.followUpDate)}
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
