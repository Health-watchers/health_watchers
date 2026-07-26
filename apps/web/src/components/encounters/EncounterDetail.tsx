'use client';

import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { Toast } from '@/components/ui';
import AiSummaryCard from './AiSummaryCard';
import { SoapNotesView } from './SoapNotesView';
import { SoapNotesEditor } from './SoapNotesEditor';
import type { EncounterRecord } from './EncounterTable';
import { usePreAuths } from '@/lib/queries/usePreAuth';
import { PreAuthStatusBadge } from '@/components/pre-auth/PreAuthStatusBadge';

interface SoapNotes {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

interface EncounterVersion {
  id: string;
  author: string;
  updatedAt: string;
  summary: string;
}

interface EncounterDocument {
  id: string;
  title: string;
  type: string;
  url: string;
}

interface EncounterDetailData extends Omit<EncounterRecord, 'status'> {
  status: string;
  soapNotes?: SoapNotes;
  versionHistory?: EncounterVersion[];
  documents?: EncounterDocument[];
  cosignatureStatus?: string;
}

interface EncounterDetailProps {
  encounter: EncounterDetailData;
  onBack: () => void;
  onEdit?: (encounterId: string) => void;
}

function InfoCard({ title, value, unit }: { title: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3">
      <p className="text-xs tracking-wide text-gray-500 uppercase">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span> : null}
      </p>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export default function EncounterDetail({ encounter, onBack, onEdit }: EncounterDetailProps) {
  const { data: preAuths = [] } = usePreAuths('pending');
  const encounterPreAuths = preAuths.filter((pa) => pa.encounterId === encounter.id);
  const [soapNotes, setSoapNotes] = useState<SoapNotes>(encounter.soapNotes ?? {});
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setSoapNotes(encounter.soapNotes ?? {});
  }, [encounter.soapNotes]);

  const saveSoapNotes = async () => {
    setIsSaving(true);
    try {
      const res = await fetchWithAuth(`${API_V1}/encounters/${encodeURIComponent(encounter.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soapNotes }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Save failed (${res.status})`);
      }

      setToast({ message: 'SOAP notes saved successfully.', type: 'success' });
      setIsEditing(false);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Unable to save SOAP notes.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            className="mb-2 text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            ← Back to list
          </button>
          <p className="text-xs tracking-wide text-gray-500 uppercase">
            Encounter Detail · {encounter.id}
          </p>
          <h2 className="text-3xl font-semibold text-gray-900">{encounter.patientName}</h2>
          <p className="mt-1 text-sm text-gray-600">
            MRN {encounter.patientMrn} · Attending: {encounter.doctor}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide text-blue-700 uppercase">
            {encounter.cosignatureStatus ?? 'Co-signature pending'}
          </span>
          <button
            onClick={() => setIsEditing((prev) => !prev)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {isEditing ? 'Cancel edit' : 'Edit SOAP'}
          </button>
          <button
            onClick={() => onEdit?.(encounter.id)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit Record
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard title="Blood Pressure" value={encounter.vitals.bloodPressure} unit="mmHg" />
        <InfoCard title="Heart Rate" value={encounter.vitals.heartRate} unit="bpm" />
        <InfoCard title="Temperature" value={encounter.vitals.temperature} unit="°F" />
        <InfoCard title="SpO2" value={encounter.vitals.spo2} unit="%" />
      </div>

      <AiSummaryCard
        encounterId={encounter.id}
        patientName={encounter.patientName}
        initialSummary={encounter.aiSummary}
        tags={['clinical-insight', 'encounter-summary']}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
              Chief Complaint
            </h3>
            <p className="mt-2 text-gray-800">{encounter.chiefComplaint}</p>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
              Diagnosis
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-800">
              {encounter.diagnosis.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
              Treatment Plan
            </h3>
            <p className="mt-2 text-gray-800">{encounter.treatmentPlan}</p>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">SOAP Notes</h3>
              {isEditing && (
                <button
                  onClick={saveSoapNotes}
                  disabled={isSaving}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save SOAP Notes'}
                </button>
              )}
            </div>
            {isEditing ? (
              <SoapNotesEditor value={soapNotes} onChange={setSoapNotes} />
            ) : (
              <SoapNotesView soapNotes={soapNotes} />
            )}
          </article>
        </div>

        <div className="space-y-4">
          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
              Prescriptions
            </h3>
            <div className="mt-2 space-y-2">
              {encounter.prescriptions.map((rx) => (
                <div key={rx.name} className="rounded-md border border-gray-200 bg-white p-3">
                  <p className="font-medium text-gray-900">{rx.name}</p>
                  <p className="text-xs text-gray-500">
                    {rx.dose} · {rx.frequency}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">
              Follow-up Date
            </h3>
            <p className="mt-2 text-gray-900">{formatDate(encounter.followUpDate)}</p>
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">Version history</h3>
            {encounter.versionHistory?.length ? (
              <ol className="mt-3 space-y-3">
                {encounter.versionHistory.map((version) => (
                  <li key={version.id} className="rounded-md border border-gray-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-gray-900">{version.author}</p>
                      <p className="text-xs text-gray-500">{formatDate(version.updatedAt)}</p>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{version.summary}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No version updates yet.</p>
            )}
          </article>

          <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase">Associated documents</h3>
            {encounter.documents?.length ? (
              <ul className="mt-3 space-y-2">
                {encounter.documents.map((doc) => (
                  <li key={doc.id} className="rounded-md border border-gray-200 bg-white p-3">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {doc.title}
                    </a>
                    <p className="text-xs text-gray-500">{doc.type}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No documents linked yet.</p>
            )}
          </article>

          {encounterPreAuths.length > 0 && (
            <article className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold tracking-wide text-gray-600 uppercase mb-3">
                Insurance Pre-Authorizations
              </h3>
              <ul className="space-y-2">
                {encounterPreAuths.map((pa) => (
                  <li key={pa._id} className="rounded-md border border-gray-200 bg-white p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">CPT: {pa.procedureCode}</span>
                      <PreAuthStatusBadge status={pa.status} />
                    </div>
                    <p className="text-xs text-gray-500">{pa.insuranceProvider} · {pa.estimatedAmount} XLM</p>
                    {pa.preAuthNumber && (
                      <p className="text-xs text-gray-500">Pre-auth #: {pa.preAuthNumber}</p>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
