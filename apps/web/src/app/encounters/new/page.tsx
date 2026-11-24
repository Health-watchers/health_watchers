'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Input, Button, Textarea } from '@/components/ui';
import { API_V1 } from '@/lib/api';
import DosageCalculatorModal from '@/components/encounters/DosageCalculatorModal';
import { PatientSection } from './components/PatientSection';
import type { PatientHit } from './components/PatientSection';
import { VitalsSection } from './components/VitalsSection';
import { DiagnosisSection, ICD10_COMMON } from './components/DiagnosisSection';
import type { DiagnosisEntry, AiResponse } from './components/DiagnosisSection';
import { PrescriptionSection } from './components/PrescriptionSection';
import type { PrescriptionRow } from './components/PrescriptionSection';

interface FullPatient extends PatientHit {
  sex: 'M' | 'F' | 'O';
}

function today() {
  return new Date().toISOString().split('T')[0];
}
function calcAge(dob: string) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

export default function NewEncounterPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledPatientId = searchParams.get('patientId') ?? '';

  const [patientQuery, setPatientQuery] = useState('');
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientHit | null>(null);
  const [patientSearching, setPatientSearching] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  const [chiefComplaint, setChiefComplaint] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

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

  const [dxQuery, setDxQuery] = useState('');
  const [diagnoses, setDiagnoses] = useState<DiagnosisEntry[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [aiSuggestions, setAiSuggestions] = useState<AiResponse | null>(null);
  const [fetchingAi, setFetchingAi] = useState(false);
  const [fullPatient, setFullPatient] = useState<FullPatient | null>(null);

  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [dosageModalOpen, setDosageModalOpen] = useState(false);
  const [activePrescriptionId, setActivePrescriptionId] = useState<number | null>(null);
  const nextPrescriptionId = useRef(1);

  const addPrescriptionRow = () =>
    setPrescriptions((prev) => [
      ...prev,
      {
        id: nextPrescriptionId.current++,
        drugName: '',
        dosage: '',
        frequency: '',
        route: 'oral',
        duration: '',
      },
    ]);
  const removePrescriptionRow = (id: number) =>
    setPrescriptions((prev) => prev.filter((r) => r.id !== id));
  const updatePrescriptionRow = (id: number, field: keyof PrescriptionRow, value: string) =>
    setPrescriptions((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const openDosageCalculator = (id: number) => {
    setActivePrescriptionId(id);
    setDosageModalOpen(true);
  };
  const applyDosageResult = (dose: string, frequency: string, route: string) => {
    if (activePrescriptionId === null) return;
    setPrescriptions((prev) =>
      prev.map((r) =>
        r.id === activePrescriptionId ? { ...r, dosage: dose, frequency, route } : r
      )
    );
  };

  const fetchFullPatient = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_V1}/patients/${id}`);
      const data = await res.json();
      if (data.success) setFullPatient(data.data);
    } catch {
      /* ignore */
    }
  }, []);

  useState(() => {
    if (prefilledPatientId) fetchFullPatient(prefilledPatientId);
  });

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

  const dxSuggestions =
    dxQuery.trim().length > 0
      ? ICD10_COMMON.filter(
          (d) =>
            d.code.toLowerCase().includes(dxQuery.toLowerCase()) ||
            d.description.toLowerCase().includes(dxQuery.toLowerCase())
        ).slice(0, 8)
      : [];

  const addDiagnosis = (d: DiagnosisEntry) => {
    if (diagnoses.length >= 10 || diagnoses.some((x) => x.code === d.code)) return;
    setDiagnoses((prev) => [...prev, { ...d, isPrimary: prev.length === 0 }]);
    setDxQuery('');
  };
  const removeDiagnosis = (code: string) =>
    setDiagnoses((prev) => prev.filter((d) => d.code !== code));

  const toC = (val: string) => {
    const n = parseFloat(val);
    return tempUnit === 'F' ? ((n - 32) * 5) / 9 : n;
  };
  const toKg = (val: string) => {
    const n = parseFloat(val);
    return weightUnit === 'lbs' ? n * 0.453592 : n;
  };
  const toCm = (val: string) => {
    const n = parseFloat(val);
    return heightUnit === 'in' ? n * 2.54 : n;
  };

  function validate() {
    const e: Record<string, string> = {};
    const pid = selectedPatient?._id ?? prefilledPatientId;
    if (!pid) e.patient = 'Select a patient';
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

  async function getAiSuggestions() {
    if (!chiefComplaint.trim()) {
      setErrors((p) => ({ ...p, chiefComplaint: 'Enter a chief complaint first' }));
      return;
    }
    const pid = selectedPatient?._id ?? prefilledPatientId;
    if (!pid) {
      setErrors((p) => ({ ...p, patient: 'Select a patient first' }));
      return;
    }
    setFetchingAi(true);
    setAiSuggestions(null);
    setSubmitError('');
    try {
      const symptoms = notes
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2);
      const vs: Record<string, number | string> = {};
      if (bp) vs.bloodPressure = bp;
      if (hr) vs.heartRate = parseFloat(hr);
      if (temp) vs.temperature = parseFloat(toC(temp).toFixed(1));
      if (spo2) vs.oxygenSaturation = parseFloat(spo2);
      const res = await fetch(`${API_V1.replace('/api/v1', '')}/api/v1/ai/differential-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chiefComplaint: chiefComplaint.trim(),
          symptoms: symptoms.length > 0 ? symptoms : [chiefComplaint.trim()],
          vitalSigns: Object.keys(vs).length > 0 ? vs : undefined,
          patientAge: fullPatient?.dateOfBirth ? calcAge(fullPatient.dateOfBirth) : undefined,
          patientSex: fullPatient?.sex,
          relevantHistory: notes.slice(0, 500),
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

  async function submit(status: 'open' | 'closed') {
    if (!validate() || !user) {
      if (!user) setSubmitError('Not authenticated');
      return;
    }
    const patientId = selectedPatient?._id ?? prefilledPatientId;
    const vs: Record<string, number | string> = {};
    if (bp) vs.bloodPressure = bp;
    if (hr) vs.heartRate = parseFloat(hr);
    if (temp) vs.temperature = parseFloat(toC(temp).toFixed(1));
    if (weight) vs.weight = parseFloat(toKg(weight).toFixed(2));
    if (height) vs.height = parseFloat(toCm(height).toFixed(1));
    if (spo2) vs.oxygenSaturation = parseFloat(spo2);
    const rxRows = prescriptions.filter((r) => r.drugName.trim());
    const body: Record<string, unknown> = {
      patientId,
      clinicId: user.clinicId,
      attendingDoctorId: user.userId,
      chiefComplaint: chiefComplaint.trim(),
      status,
      ...(notes.trim() && { notes: notes.trim() }),
      ...(diagnoses.length > 0 && { diagnosis: diagnoses }),
      ...(Object.keys(vs).length > 0 && { vitalSigns: vs }),
      ...(followUpDate && { followUpDate: new Date(followUpDate).toISOString() }),
      ...(rxRows.length > 0 && {
        prescriptions: rxRows.map((r) => ({
          drugName: r.drugName.trim(),
          dosage: r.dosage.trim() || 'As directed',
          frequency: r.frequency.trim() || 'As directed',
          route: r.route || 'oral',
          duration: r.duration.trim() || 'As directed',
          prescribedBy: user.userId,
          prescribedAt: new Date().toISOString(),
          refillsAllowed: 0,
        })),
      }),
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
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message ?? `Error ${res.status}`);
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

  const patientId = selectedPatient?._id ?? prefilledPatientId;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
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
        <PatientSection
          selectedPatient={selectedPatient}
          prefilledPatientId={prefilledPatientId}
          patientQuery={patientQuery}
          patientHits={patientHits}
          patientSearching={patientSearching}
          error={errors.patient}
          onQueryChange={(q) => {
            setPatientQuery(q);
            searchPatients(q);
          }}
          onSelectPatient={(p) => {
            setSelectedPatient(p);
            fetchFullPatient(p._id);
            setPatientHits([]);
            setPatientQuery('');
          }}
          onClearPatient={() => {
            setSelectedPatient(null);
            setPatientQuery('');
          }}
        />

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
            <span className="absolute right-3 bottom-2 text-xs text-neutral-400" aria-live="polite">
              {chiefComplaint.length}/500
            </span>
          </div>
        </section>

        <VitalsSection
          vitalsOpen={vitalsOpen}
          onToggle={() => setVitalsOpen((v) => !v)}
          bp={bp}
          setBp={setBp}
          hr={hr}
          setHr={setHr}
          temp={temp}
          setTemp={setTemp}
          tempUnit={tempUnit}
          onToggleTempUnit={() => setTempUnit((u) => (u === 'C' ? 'F' : 'C'))}
          weight={weight}
          setWeight={setWeight}
          weightUnit={weightUnit}
          onToggleWeightUnit={() => setWeightUnit((u) => (u === 'kg' ? 'lbs' : 'kg'))}
          height={height}
          setHeight={setHeight}
          heightUnit={heightUnit}
          onToggleHeightUnit={() => setHeightUnit((u) => (u === 'cm' ? 'in' : 'cm'))}
          spo2={spo2}
          setSpo2={setSpo2}
          errors={errors}
        />

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
            <span className="absolute right-3 bottom-2 text-xs text-neutral-400" aria-live="polite">
              {notes.length}/10,000
            </span>
          </div>
        </section>

        <DiagnosisSection
          chiefComplaint={chiefComplaint}
          notes={notes}
          diagnoses={diagnoses}
          dxQuery={dxQuery}
          setDxQuery={setDxQuery}
          dxSuggestions={dxSuggestions}
          aiSuggestions={aiSuggestions}
          fetchingAi={fetchingAi}
          onAddDiagnosis={addDiagnosis}
          onRemoveDiagnosis={removeDiagnosis}
          onGetAiSuggestions={getAiSuggestions}
          onDismissAi={() => setAiSuggestions(null)}
          chiefComplaintError={errors.chiefComplaint}
        />

        <PrescriptionSection
          prescriptions={prescriptions}
          onAdd={addPrescriptionRow}
          onRemove={removePrescriptionRow}
          onUpdate={updatePrescriptionRow}
          onOpenDosageCalculator={openDosageCalculator}
        />

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

      <DosageCalculatorModal
        open={dosageModalOpen}
        onClose={() => setDosageModalOpen(false)}
        initialDrugName={
          activePrescriptionId !== null
            ? (prescriptions.find((r) => r.id === activePrescriptionId)?.drugName ?? '')
            : ''
        }
        onApply={applyDosageResult}
        patientWeight={weight ? toKg(weight) : undefined}
        patientAge={fullPatient?.dateOfBirth ? calcAge(fullPatient.dateOfBirth) : undefined}
        patientSex={
          fullPatient?.sex === 'M' || fullPatient?.sex === 'F' ? fullPatient.sex : undefined
        }
      />
    </main>
  );
}
