'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Input, Button, Textarea } from '@/components/ui';
import { API_V1 } from '@/lib/api';
import { formatDate } from '@health-watchers/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientHit {
  _id: string;
  systemId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

interface DiagnosisEntry {
  code: string;
  description: string;
  isPrimary: boolean;
}

// ─── ICD-10 local mini-list (fallback when no API) ────────────────────────────

const ICD10_COMMON: DiagnosisEntry[] = [
  { code: 'J06.9',  description: 'Acute upper respiratory infection, unspecified', isPrimary: false },
  { code: 'J18.9',  description: 'Pneumonia, unspecified organism',                isPrimary: false },
  { code: 'I10',    description: 'Essential (primary) hypertension',               isPrimary: false },
  { code: 'E11.9',  description: 'Type 2 diabetes mellitus without complications', isPrimary: false },
  { code: 'M54.5',  description: 'Low back pain',                                  isPrimary: false },
  { code: 'K21.0',  description: 'Gastro-oesophageal reflux disease with oesophagitis', isPrimary: false },
  { code: 'F32.9',  description: 'Major depressive disorder, single episode, unspecified', isPrimary: false },
  { code: 'J45.909',description: 'Unspecified asthma, uncomplicated',              isPrimary: false },
  { code: 'N39.0',  description: 'Urinary tract infection, site not specified',    isPrimary: false },
  { code: 'R51',    description: 'Headache',                                       isPrimary: false },
  { code: 'R05',    description: 'Cough',                                          isPrimary: false },
  { code: 'R50.9',  description: 'Fever, unspecified',                             isPrimary: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewEncounterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledPatientId = searchParams.get('patientId') ?? '';

  // Patient selector
  const [patientQuery, setPatientQuery] = useState('');
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientHit | null>(null);
  const [patientSearching, setPatientSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Core fields
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Vitals
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [bp, setBp] = useState('');
  const [hr, setHr] = useState('');
  const [temp, setTemp] = useState('');
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [height, setHeight] = useState('');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'in'>('cm');
  const [spo2, setSpo2] = useState('');

  // Diagnosis
  const [dxQuery, setDxQuery] = useState('');
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);

  // Submission
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Patient search ──────────────────────────────────────────────────────────

  const searchPatients = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setPatientHits([]); return; }
    debounceRef.current = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const res = await fetch(`${API_V1}/patients/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setPatientHits(data.data ?? []);
      } catch { setPatientHits([]); }
      finally { setPatientSearching(false); }
    }, 300);
  }, []);

  // ── Diagnosis helpers ───────────────────────────────────────────────────────

  const dxSuggestions = dxQuery.trim().length > 0
    ? ICD10_COMMON.filter(d =>
        d.code.toLowerCase().includes(dxQuery.toLowerCase()) ||
        d.description.toLowerCase().includes(dxQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const addDiagnosis = (d: DiagnosisEntry) => {
    if (diagnoses.length >= 10) return;
    if (diagnoses.some(x => x.code === d.code)) return;
    setDiagnoses(prev => [...prev, { ...d, isPrimary: prev.length === 0 }]);
    setDxQuery('');
  };

  const removeDiagnosis = (code: string) =>
    setDiagnoses(prev => prev.filter(d => d.code !== code));

  // ── Vitals conversion ───────────────────────────────────────────────────────

  function toC(val: string) {
    const n = parseFloat(val);
    return tempUnit === 'F' ? ((n - 32) * 5) / 9 : n;
  }
  function toKg(val: string) {
    const n = parseFloat(val);
    return weightUnit === 'lbs' ? n * 0.453592 : n;
  }
  function toCm(val: string) {
    const n = parseFloat(val);
    return heightUnit === 'in' ? n * 2.54 : n;
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate() {
    const e: Record<string, string> = {};
    const patientId = selectedPatient?._id ?? prefilledPatientId;
    if (!patientId) e.patient = 'Select a patient';
    if (!chiefComplaint.trim()) e.chiefComplaint = 'Chief complaint is required';
    if (chiefComplaint.length > 500) e.chiefComplaint = 'Max 500 characters';
    if (notes.length > 10000) e.notes = 'Max 10,000 characters';
    if (hr && (isNaN(+hr) || +hr < 30 || +hr > 300)) e.hr = 'Heart rate must be 30–300 bpm';
    if (spo2 && (isNaN(+spo2) || +spo2 < 0 || +spo2 > 100)) e.spo2 = 'SpO₂ must be 0–100%';
    if (followUpDate && followUpDate <= today()) e.followUpDate = 'Follow-up date must be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function submit(status: 'open' | 'closed') {
    if (!validate()) return;
    if (!user) { setSubmitError('Not authenticated'); return; }

    const patientId = selectedPatient?._id ?? prefilledPatientId;

    const vitalSigns: Record<string, number | string> = {};
    if (bp) vitalSigns.bloodPressure = bp;
    if (hr) vitalSigns.heartRate = parseFloat(hr);
    if (temp) vitalSigns.temperature = parseFloat(toC(temp).toFixed(1));
    if (weight) vitalSigns.weight = parseFloat(toKg(weight).toFixed(2));
    if (height) vitalSigns.height = parseFloat(toCm(height).toFixed(1));
    if (spo2) vitalSigns.oxygenSaturation = parseFloat(spo2);

    const body: Record<string, unknown> = {
      patientId,
      clinicId: user.clinicId,
      attendingDoctorId: user.userId,
      chiefComplaint: chiefComplaint.trim(),
      status,
      ...(notes.trim() && { notes: notes.trim() }),
      ...(diagnoses.length > 0 && { diagnosis: diagnoses }),
      ...(Object.keys(vitalSigns).length > 0 && { vitalSigns }),
      ...(followUpDate && { followUpDate: new Date(followUpDate).toISOString() }),
    };

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API_V1}/encounters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `Error ${res.status}`);
      }
      const data = await res.json();
      const id = data.data?.id ?? data.data?._id;
      router.push(id ? `/encounters/${id}` : '/encounters');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const patientId = selectedPatient?._id ?? prefilledPatientId;

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/" className="hover:text-neutral-800">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/encounters" className="hover:text-neutral-800">Encounters</Link>
        <span aria-hidden="true">/</span>
        <span className="text-neutral-900 font-medium" aria-current="page">New Encounter</span>
      </nav>

      <h1 className="text-2xl font-bold text-neutral-900 mb-8">New Encounter</h1>

      {submitError && (
        <div role="alert" className="mb-6 rounded-md border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {submitError}
        </div>
      )}

      <div className="space-y-8">

        {/* ── Patient selector ── */}
        <section aria-labelledby="section-patient">
          <h2 id="section-patient" className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Patient <span className="text-danger-500">*</span>
          </h2>

          {selectedPatient ? (
            <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
              <div>
                <p className="font-medium text-neutral-900">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </p>
                <p className="text-xs text-neutral-500">
                  {selectedPatient.systemId} · DOB {formatDate(selectedPatient.dateOfBirth)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedPatient(null); setPatientQuery(''); }}
                className="text-xs text-primary-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
              >
                Change
              </button>
            </div>
          ) : prefilledPatientId ? (
            <p className="text-sm text-neutral-600 rounded-lg border border-neutral-200 px-4 py-3">
              Patient ID: <span className="font-mono">{prefilledPatientId}</span>
            </p>
          ) : (
            <div className="relative">
              <Input
                label="Search patient by name or ID"
                value={patientQuery}
                onChange={e => { setPatientQuery(e.target.value); searchPatients(e.target.value); }}
                placeholder="Type to search…"
                aria-autocomplete="list"
                aria-controls="patient-listbox"
                aria-expanded={patientHits.length > 0}
                error={errors.patient}
                autoComplete="off"
              />
              {(patientSearching || patientHits.length > 0) && (
                <ul
                  id="patient-listbox"
                  role="listbox"
                  aria-label="Patient suggestions"
                  className="absolute z-20 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg max-h-56 overflow-y-auto"
                >
                  {patientSearching && (
                    <li className="px-4 py-2 text-sm text-neutral-400">Searching…</li>
                  )}
                  {patientHits.map(p => (
                    <li
                      key={p._id}
                      role="option"
                      aria-selected={false}
                      className="cursor-pointer px-4 py-2 text-sm hover:bg-primary-50 focus:bg-primary-50 outline-none"
                      tabIndex={0}
                      onClick={() => { setSelectedPatient(p); setPatientHits([]); setPatientQuery(''); }}
                      onKeyDown={e => e.key === 'Enter' && (setSelectedPatient(p), setPatientHits([]), setPatientQuery(''))}
                    >
                      <span className="font-medium">{p.firstName} {p.lastName}</span>
                      <span className="ml-2 text-neutral-400 text-xs">{p.systemId} · {formatDate(p.dateOfBirth)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Chief Complaint ── */}
        <section aria-labelledby="section-complaint">
          <h2 id="section-complaint" className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Chief Complaint <span className="text-danger-500">*</span>
          </h2>
          <div className="relative">
            <Textarea
              label="Chief complaint"
              value={chiefComplaint}
              onChange={e => setChiefComplaint(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Describe the primary reason for this visit…"
              error={errors.chiefComplaint}
            />
            <span className="absolute bottom-2 right-3 text-xs text-neutral-400" aria-live="polite">
              {chiefComplaint.length}/500
            </span>
          </div>
        </section>

        {/* ── Vital Signs (collapsible) ── */}
        <section aria-labelledby="section-vitals">
          <button
            type="button"
            id="section-vitals"
            aria-expanded={vitalsOpen}
            aria-controls="vitals-panel"
            onClick={() => setVitalsOpen(v => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <span>Vital Signs <span className="font-normal normal-case text-neutral-400">(optional)</span></span>
            <span aria-hidden="true">{vitalsOpen ? '▲' : '▼'}</span>
          </button>

          {vitalsOpen && (
            <div id="vitals-panel" className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-neutral-200 p-4">
              <Input
                label="Blood Pressure (mmHg)"
                value={bp}
                onChange={e => setBp(e.target.value)}
                placeholder="e.g. 120/80"
              />

              <Input
                label="Heart Rate (bpm)"
                type="number"
                min={30}
                max={300}
                value={hr}
                onChange={e => setHr(e.target.value)}
                placeholder="30–300"
                error={errors.hr}
              />

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label={`Temperature (°${tempUnit})`}
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={e => setTemp(e.target.value)}
                    placeholder={tempUnit === 'C' ? '36.5' : '97.7'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTempUnit(u => u === 'C' ? 'F' : 'C')}
                  className="mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  aria-label={`Switch to °${tempUnit === 'C' ? 'F' : 'C'}`}
                >
                  °{tempUnit === 'C' ? 'F' : 'C'}
                </button>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label={`Weight (${weightUnit})`}
                    type="number"
                    step="0.1"
                    min={0}
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder={weightUnit === 'kg' ? '70' : '154'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setWeightUnit(u => u === 'kg' ? 'lbs' : 'kg')}
                  className="mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  aria-label={`Switch to ${weightUnit === 'kg' ? 'lbs' : 'kg'}`}
                >
                  {weightUnit === 'kg' ? 'lbs' : 'kg'}
                </button>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label={`Height (${heightUnit})`}
                    type="number"
                    step="0.1"
                    min={0}
                    value={height}
                    onChange={e => setHeight(e.target.value)}
                    placeholder={heightUnit === 'cm' ? '170' : '67'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setHeightUnit(u => u === 'cm' ? 'in' : 'cm')}
                  className="mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  aria-label={`Switch to ${heightUnit === 'cm' ? 'inches' : 'cm'}`}
                >
                  {heightUnit === 'cm' ? 'in' : 'cm'}
                </button>
              </div>

              <Input
                label="Oxygen Saturation (%)"
                type="number"
                min={0}
                max={100}
                value={spo2}
                onChange={e => setSpo2(e.target.value)}
                placeholder="0–100"
                error={errors.spo2}
              />
            </div>
          )}
        </section>

        {/* ── Clinical Notes ── */}
        <section aria-labelledby="section-notes">
          <h2 id="section-notes" className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Clinical Notes
          </h2>
          <div className="relative">
            <Textarea
              label="Notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="Clinical observations, history, examination findings…"
              error={errors.notes}
            />
            <span className="absolute bottom-2 right-3 text-xs text-neutral-400" aria-live="polite">
              {notes.length}/10,000
            </span>
          </div>
        </section>

        {/* ── Diagnosis (ICD-10) ── */}
        <section aria-labelledby="section-dx">
          <h2 id="section-dx" className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Diagnosis (ICD-10) <span className="font-normal normal-case text-neutral-400">— up to 10</span>
          </h2>

          {diagnoses.length > 0 && (
            <ul className="mb-3 space-y-1" aria-label="Selected diagnoses">
              {diagnoses.map((d, i) => (
                <li key={d.code} className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-mono font-medium text-primary-700">{d.code}</span>
                    <span className="ml-2 text-neutral-700">{d.description}</span>
                    {i === 0 && <span className="ml-2 text-xs text-neutral-400">(primary)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDiagnosis(d.code)}
                    aria-label={`Remove ${d.code}`}
                    className="ml-3 text-neutral-400 hover:text-danger-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {diagnoses.length < 10 && (
            <div className="relative">
              <Input
                label="Search ICD-10 code or description"
                value={dxQuery}
                onChange={e => setDxQuery(e.target.value)}
                placeholder="e.g. J06.9 or hypertension"
                aria-autocomplete="list"
                aria-controls="dx-listbox"
                aria-expanded={dxSuggestions.length > 0}
                autoComplete="off"
              />
              {dxSuggestions.length > 0 && (
                <ul
                  id="dx-listbox"
                  role="listbox"
                  aria-label="ICD-10 suggestions"
                  className="absolute z-20 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg max-h-56 overflow-y-auto"
                >
                  {dxSuggestions.map(d => (
                    <li
                      key={d.code}
                      role="option"
                      aria-selected={diagnoses.some(x => x.code === d.code)}
                      className="cursor-pointer px-4 py-2 text-sm hover:bg-primary-50 focus:bg-primary-50 outline-none"
                      tabIndex={0}
                      onClick={() => addDiagnosis(d)}
                      onKeyDown={e => e.key === 'Enter' && addDiagnosis(d)}
                    >
                      <span className="font-mono font-medium text-primary-700">{d.code}</span>
                      <span className="ml-2 text-neutral-600">{d.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Follow-up Date ── */}
        <section aria-labelledby="section-followup">
          <h2 id="section-followup" className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-3">
            Follow-up Date
          </h2>
          <Input
            label="Follow-up date"
            type="date"
            min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
            value={followUpDate}
            onChange={e => setFollowUpDate(e.target.value)}
            error={errors.followUpDate}
          />
        </section>

        {/* ── Actions ── */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-neutral-200">
          <Button
            variant="primary"
            onClick={() => submit('closed')}
            loading={submitting}
            disabled={submitting}
          >
            Complete Encounter
          </Button>
          <Button
            variant="outline"
            onClick={() => submit('open')}
            loading={submitting}
            disabled={submitting}
          >
            Save Draft
          </Button>
          <Link
            href={patientId ? `/patients/${patientId}` : '/encounters'}
            className="ml-auto text-sm text-neutral-500 hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
            onClick={e => {
              if (!confirm('Discard this encounter?')) e.preventDefault();
            }}
          >
            Cancel
          </Link>
        </div>

      </div>
    </main>
  );
}
