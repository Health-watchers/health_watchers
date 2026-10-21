'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEncounter } from '@/lib/queries/useEncounter';
import { TableSkeleton, ErrorMessage, Button } from '@/components/ui';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function EncounterPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useEncounter(params.id);

  if (isLoading) return <TableSkeleton columns={4} rows={6} />;
  if (error)
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : 'Unable to load encounter details.'}
        onRetry={() => window.location.reload()}
      />
    );
  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Encounter not found.</p>
          <Button onClick={() => router.push('/encounters')} className="mt-4">
            Back to encounters
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          /* Hide everything that is not the print content */
          body > *:not(#print-root) { display: none !important; }
          #print-root { display: block !important; }

          /* Hide screen-only elements inside the print root */
          .no-print { display: none !important; }

          /* Reset page */
          @page {
            size: letter;
            margin: 0.75in 0.75in 0.75in 0.75in;
          }

          body {
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.5;
          }

          /* Clinic header */
          .print-header {
            border-bottom: 2px solid #000;
            padding-bottom: 10pt;
            margin-bottom: 14pt;
          }

          /* Section page breaks */
          .print-section {
            page-break-before: auto;
            break-before: auto;
          }
          .print-section-break {
            page-break-before: always;
            break-before: always;
          }

          /* Table styling */
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border: 1px solid #999;
            padding: 4pt 6pt;
            text-align: left;
            font-size: 10pt;
          }
          th {
            background: #eeeeee !important;
            font-weight: bold;
          }

          /* Remove shadows / backgrounds */
          * {
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }

        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      <div id="print-root">
        {/* ── Screen toolbar (hidden when printing) ── */}
        <div className="no-print sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
          <button
            onClick={() => router.back()}
            className="text-sm font-medium text-blue-700 hover:text-blue-800"
          >
            ← Back
          </button>
          <span className="flex-1 text-sm text-gray-500">
            Print preview — {data.patientName} · {data.id}
          </span>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Print / Save as PDF
          </button>
        </div>

        {/* ── Printable document ── */}
        <main className="mx-auto max-w-4xl px-6 py-8 print:p-0">

          {/* Clinic header (visible in print header) */}
          <header className="print-header mb-8 border-b-2 border-gray-800 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Health Watchers Clinic</h1>
                <p className="text-sm text-gray-600">123 Medical Plaza, Suite 400 · (555) 800-1234</p>
                <p className="text-sm text-gray-600">support@healthwatchers.com</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">Visit Summary</p>
                <p className="font-semibold text-gray-900">{data.id}</p>
                <p className="text-sm text-gray-600">Printed: {formatDateTime(new Date().toISOString())}</p>
              </div>
            </div>

            {/* Patient & encounter meta */}
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div>
                <span className="font-semibold text-gray-700">Patient: </span>
                <span className="text-gray-900">{data.patientName}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">MRN: </span>
                <span className="text-gray-900">{data.patientMrn}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Attending Physician: </span>
                <span className="text-gray-900">{data.doctor}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Status: </span>
                <span className="capitalize text-gray-900">{data.status}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-700">Chief Complaint: </span>
                <span className="text-gray-900">{data.chiefComplaint}</span>
              </div>
              {data.followUpDate && (
                <div>
                  <span className="font-semibold text-gray-700">Follow-up Date: </span>
                  <span className="text-gray-900">{formatDate(data.followUpDate)}</span>
                </div>
              )}
            </div>
          </header>

          {/* ── Section 1: Vitals ── */}
          <section className="print-section mb-8">
            <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
              Vital Signs
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                  <th className="border border-gray-300 px-3 py-2">Measurement</th>
                  <th className="border border-gray-300 px-3 py-2">Value</th>
                  <th className="border border-gray-300 px-3 py-2">Unit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Blood Pressure</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-900">{data.vitals.bloodPressure}</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-500">mmHg</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Heart Rate</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-900">{data.vitals.heartRate}</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-500">bpm</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">Temperature</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-900">{data.vitals.temperature}</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-500">°F</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-3 py-2 font-medium text-gray-700">
                    Oxygen Saturation (SpO₂)
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-900">{data.vitals.spo2}</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-500">%</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ── Section 2: Diagnoses ── */}
          <section className="print-section mb-8">
            <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
              Diagnoses
            </h2>
            {data.diagnosis.length > 0 ? (
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-900">
                {data.diagnosis.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No diagnoses recorded.</p>
            )}
          </section>

          {/* ── Section 3: Prescriptions ── */}
          <section className="print-section mb-8">
            <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
              Medications / Prescriptions
            </h2>
            {data.prescriptions.length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                    <th className="border border-gray-300 px-3 py-2">Drug Name</th>
                    <th className="border border-gray-300 px-3 py-2">Dosage</th>
                    <th className="border border-gray-300 px-3 py-2">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.prescriptions.map((rx, idx) => (
                    <tr key={idx} className="even:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-2 font-medium text-gray-900">
                        {rx.name}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-gray-900">{rx.dose}</td>
                      <td className="border border-gray-300 px-3 py-2 text-gray-700">
                        {rx.frequency}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">No prescriptions recorded.</p>
            )}
          </section>

          {/* ── Section 4: SOAP Notes ── */}
          {data.soapNotes && (
            <section className="print-section-break print-section mb-8">
              <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
                SOAP Notes
              </h2>
              <div className="space-y-4 text-sm">
                {data.soapNotes.subjective && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-gray-700">Subjective</p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-900">{data.soapNotes.subjective}</p>
                  </div>
                )}
                {data.soapNotes.objective && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-gray-700">Objective</p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-900">{data.soapNotes.objective}</p>
                  </div>
                )}
                {data.soapNotes.assessment && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-gray-700">Assessment</p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-900">{data.soapNotes.assessment}</p>
                  </div>
                )}
                {data.soapNotes.plan && (
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-gray-700">Plan</p>
                    <p className="mt-1 whitespace-pre-wrap text-gray-900">{data.soapNotes.plan}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Section 5: Treatment Plan ── */}
          {data.treatmentPlan && (
            <section className="print-section mb-8">
              <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
                Treatment Plan
              </h2>
              <p className="whitespace-pre-wrap text-sm text-gray-900">{data.treatmentPlan}</p>
            </section>
          )}

          {/* ── Section 6: Follow-up ── */}
          {data.followUpDate && (
            <section className="print-section mb-8">
              <h2 className="mb-3 border-b border-gray-300 pb-1 text-lg font-bold uppercase tracking-wide text-gray-800">
                Follow-up
              </h2>
              <p className="text-sm text-gray-900">
                <span className="font-semibold">Scheduled Follow-up Date: </span>
                {formatDate(data.followUpDate)}
              </p>
            </section>
          )}

          {/* ── Print footer ── */}
          <footer className="mt-12 border-t border-gray-300 pt-4 text-xs text-gray-500">
            <p>
              This document is generated from Health Watchers EHR and is intended for the treating
              physician and authorized clinical staff only. Handle per HIPAA guidelines.
            </p>
            <p className="mt-1">
              Patient: {data.patientName} · MRN: {data.patientMrn} · Encounter: {data.id}
            </p>
          </footer>
        </main>
      </div>
    </>
  );
}
