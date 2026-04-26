'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Input, Button, Textarea, Badge } from '@/components/ui';
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

interface FullPatient extends PatientHit {
  sex: 'M' | 'F' | 'O';
}

interface DiagnosisEntry {
  code: string;
  description: string;
  isPrimary: boolean;
}

interface EncounterTemplate {
  _id: string;
  name: string;
  description?: string;
  category: string;
  defaultChiefComplaint?: string;
  defaultVitalSigns?: Record<string, unknown>;
  suggestedDiagnoses?: { code: string; description: string }[];
  suggestedTests?: string[];
  notes?: string;
  usageCount: number;
}

interface AiDifferential {
  diagnosis: string;
  icdCode: string;
  probability: 'high' | 'medium' | 'low';
  reasoning: string;
  recommendedTests: string[];
}

interface AiResponse {
  success: boolean;
  differentials: AiDifferential[];
  urgency: 'routine' | 'urgent' | 'emergency';
  disclaimer: string;
}

// ─── ICD-10 local mini-list (fallback when no API) ────────────────────────────

const ICD10_COMMON: DiagnosisEntry[] = [
  {
    code: 'J06.9',
    description: 'Acute upper respiratory infection, unspecified',
    isPrimary: false,
  },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism', isPrimary: false },
  { code: 'I10', description: 'Essential (primary) hypertension', isPrimary: false },
  {
    code: 'E11.9',
    description: 'Type 2 diabetes mellitus without complications',
    isPrimary: false,
  },
  { code: 'M54.5', description: 'Low back pain', isPrimary: false },
  {
    code: 'K21.0',
    description: 'Gastro-oesophageal reflux disease with oesophagitis',
    isPrimary: false,
  },
  {
    code: 'F32.9',
    description: 'Major depressive disorder, single episode, unspecified',
    isPrimary: false,
  },
  { code: 'J45.909', description: 'Unspecified asthma, uncomplicated', isPrimary: false },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', isPrimary: false },
  { code: 'R51', description: 'Headache', isPrimary: false },
  { code: 'R05', description: 'Cough', isPrimary: false },
  { code: 'R50.9', description: 'Fever, unspecified', isPrimary: false },
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
  const [patientAllergies, setPatientAllergies] = useState<
    Array<{ _id: string; allergen: string; severity: string; reaction: string }>
  >([]);

  // Templates
  const [templates, setTemplates] = useState<EncounterTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<EncounterTemplate | null>(null);

  useEffect(() => {
    fetch(`${API_V1}/encounter-templates`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data) setTemplates(d.data);
      })
      .catch(() => {});
  }, []);

  // AI Suggestions
  const [aiSuggestions, setAiSuggestions] = useState<AiResponse | null>(null);
  const [fetchingAi, setFetchingAi] = useState(false);
  const [fullPatient, setFullPatient] = useState<FullPatient | null>(null);

  // Fetch full patient data when selected
  const fetchFullPatient = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_V1}/patients/${id}`);
      const data = await res.json();
      if (data.success) setFullPatient(data.data);
    } catch {
      /* ignore */
    }
  }, []);

  // Effect to fetch prefilled patient
  useState(() => {
    if (prefilledPatientId) fetchFullPatient(prefilledPatientId);
  });

  // ── Patient search ──────────────────────────────────────────────────────────

  const searchPatients = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setPatientHits([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setPatientSearching(true);
      try {
        const res = await fetch(`${API_V1}/patients/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setPatientHits(data.data ?? []);
      } catch {
        setPatientHits([]);
      } finally {
        setPatientSearching(false);
      }
    }, 300);
  }, []);

  // ── Diagnosis helpers ───────────────────────────────────────────────────────

  const dxSuggestions =
    dxQuery.trim().length > 0
      ? ICD10_COMMON.filter(
          (d) =>
            d.code.toLowerCase().includes(dxQuery.toLowerCase()) ||
            d.description.toLowerCase().includes(dxQuery.toLowerCase())
        ).slice(0, 8)
      : [];

  const addDiagnosis = (d: DiagnosisEntry) => {
    if (diagnoses.length >= 10) return;
    if (diagnoses.some((x) => x.code === d.code)) return;
    setDiagnoses((prev) => [...prev, { ...d, isPrimary: prev.length === 0 }]);
    setDxQuery('');
  };

  const removeDiagnosis = (code: string) =>
    setDiagnoses((prev) => prev.filter((d) => d.code !== code));

  // ── Template application ────────────────────────────────────────────────────

  const applyTemplate = (t: EncounterTemplate) => {
    if (t.defaultChiefComplaint && !chiefComplaint) setChiefComplaint(t.defaultChiefComplaint);
    if (t.notes && !notes) setNotes(t.notes);
    if (t.defaultVitalSigns) {
      const vs = t.defaultVitalSigns as Record<string, string>;
      if (vs.bloodPressure && !bp) setBp(vs.bloodPressure);
      if (vs.heartRate && !hr) setHr(String(vs.heartRate));
      if (vs.temperature && !temp) setTemp(String(vs.temperature));
      if (vs.oxygenSaturation && !spo2) setSpo2(String(vs.oxygenSaturation));
      if (vs.weight && !weight) setWeight(String(vs.weight));
      if (vs.height && !height) setHeight(String(vs.height));
    }
    if (t.suggestedDiagnoses?.length && diagnoses.length === 0) {
      setDiagnoses(t.suggestedDiagnoses.map((d, i) => ({ ...d, isPrimary: i === 0 })));
    }
    setSelectedTemplateId(t._id);
    setPreviewTemplate(null);
  };

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
    if (followUpDate && followUpDate <= today())
      e.followUpDate = 'Follow-up date must be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── AI Suggestions ─────────────────────────────────────────────────────────

  async function getAiSuggestions() {
    if (!chiefComplaint.trim()) {
      setErrors((prev) => ({ ...prev, chiefComplaint: 'Enter a chief complaint first' }));
      return;
    }

    const patientId = selectedPatient?._id ?? prefilledPatientId;
    if (!patientId) {
      setErrors((prev) => ({ ...prev, patient: 'Select a patient first' }));
      return;
    }

    setFetchingAi(true);
    setAiSuggestions(null);
    setSubmitError('');

    try {
      // Extract symptoms from notes (simple comma split for now)
      const symptoms = notes
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);

      const vitalSigns: Record<string, number | string> = {};
      if (bp) vitalSigns.bloodPressure = bp;
      if (hr) vitalSigns.heartRate = parseFloat(hr);
      if (temp) vitalSigns.temperature = parseFloat(toC(temp).toFixed(1));
      if (spo2) vitalSigns.oxygenSaturation = parseFloat(spo2);

      const age = fullPatient?.dateOfBirth ? calcAge(fullPatient.dateOfBirth) : undefined;

      const res = await fetch(`${API_V1.replace('/api/v1', '')}/api/v1/ai/differential-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chiefComplaint: chiefComplaint.trim(),
          symptoms: symptoms.length > 0 ? symptoms : [chiefComplaint.trim()],
          vitalSigns: Object.keys(vitalSigns).length > 0 ? vitalSigns : undefined,
          patientAge: age,
          patientSex: fullPatient?.sex,
          relevantHistory: notes.slice(0, 500), // simplistic history extraction
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Failed to get suggestions');
      setAiSuggestions(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'AI suggestion failed');
    } finally {
      setFetchingAi(false);
    }
  }

  function calcAge(dob: string): number {
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function submit(status: 'open' | 'closed') {
    if (!validate()) return;
    if (!user) {
      setSubmitError('Not authenticated');
      return;
    }

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
      const res = await fetch(
        `${API_V1}/encounters${selectedTemplateId ? `?templateId=${selectedTemplateId}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
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
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-sm text-neutral-500"
      >
        <Link href="/" className="hover:text-neutral-800">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/encounters" className="hover:text-neutral-800">
          Encounters
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-neutral-900" aria-current="page">
          New Encounter
        </span>
      </nav>

      <h1 className="mb-8 text-2xl font-bold text-neutral-900">New Encounter</h1>

      {submitError && (
        <div
          role="alert"
          className="border-danger-200 bg-danger-50 text-danger-700 mb-6 rounded-md border px-4 py-3 text-sm"
        >
          {submitError}
        </div>
      )}

      <div className="space-y-8">
        {/* ── Patient selector ── */}
        <section aria-labelledby="section-patient">
          <h2
            id="section-patient"
            className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Patient <span className="text-danger-500">*</span>
          </h2>

          {selectedPatient ? (
            <div className="border-primary-200 bg-primary-50 flex items-center justify-between rounded-lg border px-4 py-3">
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
                onClick={() => {
                  setSelectedPatient(null);
                  setPatientQuery('');
                  setPatientAllergies([]);
                }}
                className="text-primary-600 focus-visible:ring-primary-500 rounded text-xs hover:underline focus:outline-none focus-visible:ring-2"
              >
                Change
              </button>
            </div>
          ) : prefilledPatientId ? (
            <p className="rounded-lg border border-neutral-200 px-4 py-3 text-sm text-neutral-600">
              Patient ID: <span className="font-mono">{prefilledPatientId}</span>
            </p>
          ) : (
            <div className="relative">
              <Input
                label="Search patient by name or ID"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  searchPatients(e.target.value);
                }}
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
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
                >
                  {patientSearching && (
                    <li className="px-4 py-2 text-sm text-neutral-500">Searching…</li>
                  )}
                  {patientHits.map((p) => (
                    <li
                      key={p._id}
                      role="option"
                      aria-selected={false}
                      className="hover:bg-primary-50 focus:bg-primary-50 cursor-pointer px-4 py-2 text-sm outline-none"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedPatient(p);
                        fetchFullPatient(p._id);
                        setPatientHits([]);
                        setPatientQuery('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setSelectedPatient(p);
                          fetchFullPatient(p._id);
                          setPatientHits([]);
                          setPatientQuery('');
                        }
                      }}
                    >
                      <span className="font-medium">
                        {p.firstName} {p.lastName}
                      </span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {p.systemId} · {formatDate(p.dateOfBirth)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ── Template Selector ── */}
        {templates.length > 0 && (
          <section aria-labelledby="section-template">
            <h2
              id="section-template"
              className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
            >
              Start from Template{' '}
              <span className="font-normal text-neutral-400 normal-case">(optional)</span>
            </h2>

            {selectedTemplateId ? (
              <div className="border-primary-200 bg-primary-50 flex items-center justify-between rounded-lg border px-4 py-3">
                <p className="text-sm font-medium text-neutral-900">
                  {templates.find((t) => t._id === selectedTemplateId)?.name}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId('')}
                  className="text-primary-600 text-xs hover:underline focus:outline-none"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <div
                    key={t._id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">{t.name}</p>
                      <p className="text-xs text-neutral-400">
                        {t.category}
                        {t.usageCount > 0 ? ` · used ${t.usageCount}×` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewTemplate(previewTemplate?._id === t._id ? null : t)
                        }
                        className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800 focus:outline-none"
                        aria-expanded={previewTemplate?._id === t._id}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTemplate(t)}
                        className="text-primary-600 hover:text-primary-800 border-primary-200 hover:bg-primary-50 rounded border px-2 py-1 text-xs focus:outline-none"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {previewTemplate && (
              <div className="mt-3 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
                <p className="font-semibold text-neutral-800">{previewTemplate.name}</p>
                {previewTemplate.description && (
                  <p className="text-neutral-600">{previewTemplate.description}</p>
                )}
                {previewTemplate.defaultChiefComplaint && (
                  <p className="text-neutral-600">
                    <span className="font-medium">Chief complaint:</span>{' '}
                    {previewTemplate.defaultChiefComplaint}
                  </p>
                )}
                {previewTemplate.suggestedDiagnoses?.length ? (
                  <p className="text-neutral-600">
                    <span className="font-medium">Diagnoses:</span>{' '}
                    {previewTemplate.suggestedDiagnoses.map((d) => d.code).join(', ')}
                  </p>
                ) : null}
                {previewTemplate.suggestedTests?.length ? (
                  <p className="text-neutral-600">
                    <span className="font-medium">Tests:</span>{' '}
                    {previewTemplate.suggestedTests.join(', ')}
                  </p>
                ) : null}
                {previewTemplate.notes && (
                  <p className="text-neutral-600">
                    <span className="font-medium">Notes:</span> {previewTemplate.notes}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => applyTemplate(previewTemplate)}
                  className="text-primary-600 mt-1 text-xs font-medium hover:underline focus:outline-none"
                >
                  Apply this template →
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Allergy Alert ── */}
        {patientAllergies.length > 0 && (
          <div
            role="alert"
            aria-live="assertive"
            className="border-danger-300 bg-danger-50 rounded-lg border px-4 py-3"
          >
            <p className="text-danger-800 mb-2 text-sm font-semibold">⚠ Known Allergies</p>
            <ul className="space-y-1">
              {patientAllergies.map((a) => (
                <li key={a._id} className="text-danger-700 text-sm">
                  <span className="font-medium">{a.allergen}</span> — {a.severity} · {a.reaction}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Chief Complaint ── */}
        <section aria-labelledby="section-complaint">
          <h2
            id="section-complaint"
            className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Chief Complaint <span className="text-danger-500">*</span>
          </h2>
          <div className="relative">
            <Textarea
              label="Chief complaint"
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Describe the primary reason for this visit…"
              error={errors.chiefComplaint}
            />
            <span className="absolute right-3 bottom-2 text-xs text-neutral-500" aria-live="polite">
              {chiefComplaint.length}/500
            </span>
          </div>

          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={getAiSuggestions}
              loading={fetchingAi}
              disabled={fetchingAi || !chiefComplaint.trim()}
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <span className="mr-2">✨</span>
              Get AI Suggestions
            </Button>
          </div>

          {/* AI Suggestions Panel */}
          {aiSuggestions && (
            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/30 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white uppercase">
                    Differential Diagnosis AI
                  </span>
                  <Badge
                    variant={
                      aiSuggestions.urgency === 'emergency'
                        ? 'danger'
                        : aiSuggestions.urgency === 'urgent'
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {aiSuggestions.urgency} urgency
                  </Badge>
                </div>
                <button
                  onClick={() => setAiSuggestions(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {aiSuggestions.differentials.map((diff, i) => (
                  <div key={i} className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-neutral-900">{diff.diagnosis}</h3>
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                            {diff.icdCode}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                          {diff.reasoning}
                        </p>
                        {diff.recommendedTests?.length > 0 && (
                          <p className="mt-2 text-[10px] text-neutral-400">
                            Recommended: {diff.recommendedTests.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            diff.probability === 'high'
                              ? 'bg-red-50 text-red-700'
                              : diff.probability === 'medium'
                                ? 'bg-orange-50 text-orange-700'
                                : 'bg-green-50 text-green-700'
                          }`}
                        >
                          {diff.probability} probability
                        </span>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() =>
                            addDiagnosis({
                              code: diff.icdCode,
                              description: diff.diagnosis,
                              isPrimary: diagnoses.length === 0,
                            })
                          }
                          disabled={diagnoses.some((d) => d.code === diff.icdCode)}
                        >
                          {diagnoses.some((d) => d.code === diff.icdCode)
                            ? 'Added'
                            : 'Add Diagnosis'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[10px] text-neutral-400 italic">{aiSuggestions.disclaimer}</p>
            </div>
          )}
        </section>

        {/* ── Vital Signs (collapsible) ── */}
        <section aria-labelledby="section-vitals">
          <button
            type="button"
            id="section-vitals"
            aria-expanded={vitalsOpen}
            aria-controls="vitals-panel"
            onClick={() => setVitalsOpen((v) => !v)}
            className="focus-visible:ring-primary-500 flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase hover:bg-neutral-100 focus:outline-none focus-visible:ring-2"
          >
            <span>
              Vital Signs{' '}
              <span className="font-normal text-neutral-500 normal-case">(optional)</span>
            </span>
            <span aria-hidden="true">{vitalsOpen ? '▲' : '▼'}</span>
          </button>

          {vitalsOpen && (
            <div
              id="vitals-panel"
              className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2"
            >
              <Input
                label="Blood Pressure (mmHg)"
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                placeholder="e.g. 120/80"
              />

              <Input
                label="Heart Rate (bpm)"
                type="number"
                min={30}
                max={300}
                value={hr}
                onChange={(e) => setHr(e.target.value)}
                placeholder="30–300"
                error={errors.hr}
              />

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={`Temperature (°${tempUnit})`}
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    placeholder={tempUnit === 'C' ? '36.5' : '97.7'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setTempUnit((u) => (u === 'C' ? 'F' : 'C'))}
                  className="focus-visible:ring-primary-500 mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2"
                  aria-label={`Switch to °${tempUnit === 'C' ? 'F' : 'C'}`}
                >
                  °{tempUnit === 'C' ? 'F' : 'C'}
                </button>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={`Weight (${weightUnit})`}
                    type="number"
                    step="0.1"
                    min={0}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder={weightUnit === 'kg' ? '70' : '154'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setWeightUnit((u) => (u === 'kg' ? 'lbs' : 'kg'))}
                  className="focus-visible:ring-primary-500 mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2"
                  aria-label={`Switch to ${weightUnit === 'kg' ? 'lbs' : 'kg'}`}
                >
                  {weightUnit === 'kg' ? 'lbs' : 'kg'}
                </button>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label={`Height (${heightUnit})`}
                    type="number"
                    step="0.1"
                    min={0}
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder={heightUnit === 'cm' ? '170' : '67'}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setHeightUnit((u) => (u === 'cm' ? 'in' : 'cm'))}
                  className="focus-visible:ring-primary-500 mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2"
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
                onChange={(e) => setSpo2(e.target.value)}
                placeholder="0–100"
                error={errors.spo2}
              />
            </div>
          )}
        </section>

        {/* ── Clinical Notes ── */}
        <section aria-labelledby="section-notes">
          <h2
            id="section-notes"
            className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Clinical Notes
          </h2>
          <div className="relative">
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              maxLength={10000}
              placeholder="Clinical observations, history, examination findings…"
              error={errors.notes}
            />
            <span className="absolute right-3 bottom-2 text-xs text-neutral-500" aria-live="polite">
              {notes.length}/10,000
            </span>
          </div>
        </section>

        {/* ── Diagnosis (ICD-10) ── */}
        <section aria-labelledby="section-dx">
          <h2
            id="section-dx"
            className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Diagnosis (ICD-10){' '}
            <span className="font-normal text-neutral-500 normal-case">— up to 10</span>
          </h2>

          {diagnoses.length > 0 && (
            <ul className="mb-3 space-y-1" aria-label="Selected diagnoses">
              {diagnoses.map((d, i) => (
                <li
                  key={d.code}
                  className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="text-primary-700 font-mono font-medium">{d.code}</span>
                    <span className="ml-2 text-neutral-700">{d.description}</span>
                    {i === 0 && <span className="ml-2 text-xs text-neutral-500">(primary)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDiagnosis(d.code)}
                    aria-label={`Remove ${d.code}`}
                    className="hover:text-danger-500 focus-visible:ring-primary-500 ml-3 rounded text-neutral-500 focus:outline-none focus-visible:ring-2"
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
                onChange={(e) => setDxQuery(e.target.value)}
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
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
                >
                  {dxSuggestions.map((d) => (
                    <li
                      key={d.code}
                      role="option"
                      aria-selected={diagnoses.some((x) => x.code === d.code)}
                      className="hover:bg-primary-50 focus:bg-primary-50 cursor-pointer px-4 py-2 text-sm outline-none"
                      tabIndex={0}
                      onClick={() => addDiagnosis(d)}
                      onKeyDown={(e) => e.key === 'Enter' && addDiagnosis(d)}
                    >
                      <span className="text-primary-700 font-mono font-medium">{d.code}</span>
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
          <h2
            id="section-followup"
            className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Follow-up Date
          </h2>
          <Input
            label="Follow-up date"
            type="date"
            min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
            value={followUpDate}
            onChange={(e) => setFollowUpDate(e.target.value)}
            error={errors.followUpDate}
          />
        </section>

        {/* ── Actions ── */}
        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-2">
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
            className="focus-visible:ring-primary-500 ml-auto rounded text-sm text-neutral-500 hover:text-neutral-800 focus:outline-none focus-visible:ring-2"
            onClick={(e) => {
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
