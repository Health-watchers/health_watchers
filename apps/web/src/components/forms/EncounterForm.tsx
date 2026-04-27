'use client';

import { useMemo, useState } from 'react';

export interface EncounterFormValues {
  patientName: string;
  patientMrn: string;
  doctor: string;
  chiefComplaint: string;
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  spo2: string;
  diagnosis: string;
  treatmentPlan: string;
  prescriptions: string;
  followUpDate: string;
}

interface EncounterFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EncounterFormValues) => void;
  doctors?: string[];
}

const INITIAL_VALUES: EncounterFormValues = {
  patientName: '',
  patientMrn: '',
  doctor: 'Dr. Julian Smith',
  chiefComplaint: '',
  bloodPressure: '',
  heartRate: '',
  temperature: '',
  spo2: '',
  diagnosis: '',
  treatmentPlan: '',
  prescriptions: '',
  followUpDate: '',
};

const STEPS = ['Initial Assessment', 'Clinical Data', 'Review & Sign'];

export default function EncounterForm({
  open,
  onClose,
  onSubmit,
  doctors = ['Dr. Julian Smith'],
}: EncounterFormProps) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  if (!open) {
    return null;
  }

  const validateStep = (stepIndex: number) => {
    const currentErrors: Record<string, string> = {};

    if (stepIndex === 0) {
      if (!values.patientName.trim()) currentErrors.patientName = 'Patient name is required';
      if (!values.patientMrn.trim()) currentErrors.patientMrn = 'Patient MRN is required';
      if (!values.doctor.trim()) currentErrors.doctor = 'Attending doctor is required';
      if (!values.chiefComplaint.trim())
        currentErrors.chiefComplaint = 'Chief complaint is required';
    }

    if (stepIndex === 1) {
      if (!values.bloodPressure.trim()) currentErrors.bloodPressure = 'Blood pressure is required';
      if (!values.heartRate.trim()) currentErrors.heartRate = 'Heart rate is required';
      if (!values.temperature.trim()) currentErrors.temperature = 'Temperature is required';
      if (!values.spo2.trim()) currentErrors.spo2 = 'SpO2 is required';
      if (!values.diagnosis.trim()) currentErrors.diagnosis = 'Diagnosis is required';
      if (!values.treatmentPlan.trim()) currentErrors.treatmentPlan = 'Treatment plan is required';
    }

    if (stepIndex === 2) {
      if (!values.prescriptions.trim())
        currentErrors.prescriptions = 'Prescription details are required';
      if (!values.followUpDate.trim()) currentErrors.followUpDate = 'Follow-up date is required';
    }

    setErrors(currentErrors);
    return Object.keys(currentErrors).length === 0;
  };

  const next = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const previous = () => {
    setErrors({});
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const submit = () => {
    if (!validateStep(2)) {
      return;
    }
    onSubmit(values);
    setValues(INITIAL_VALUES);
    setErrors({});
    setStep(0);
    onClose();
  };

  const field = (
    key: keyof EncounterFormValues,
    label: string,
    placeholder: string,
    multiline?: boolean
  ) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold tracking-wide text-neutral-600 uppercase">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={values[key]}
          onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
          className="bg-neutral-0 focus:border-primary-400 min-h-24 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none"
        />
      ) : (
        <input
          value={values[key]}
          onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
          placeholder={placeholder}
          className="bg-neutral-0 focus:border-primary-400 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none"
        />
      )}
      {errors[key] ? <p className="text-error-500 mt-1 text-xs">{errors[key]}</p> : null}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-full max-w-[560px] overflow-y-auto bg-neutral-50 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900">Log Encounter</h2>
            <p className="text-sm text-neutral-500">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-neutral-0 rounded-md p-2 text-neutral-500">
            ✕
          </button>
        </div>

        <div className="bg-neutral-0 mb-5 rounded-md p-3">
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="bg-primary-700 h-full rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 text-[11px] font-medium text-neutral-500">
            {STEPS.map((title, index) => (
              <span key={title} className={index <= step ? 'text-primary-700' : ''}>
                {title}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-neutral-0 space-y-4 rounded-lg p-4">
          {step === 0 ? (
            <>
              {field('patientName', 'Patient Name', 'Enter patient full name')}
              {field('patientMrn', 'Patient MRN', 'Enter medical record number')}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                  Attending Doctor
                </span>
                <select
                  value={values.doctor}
                  onChange={(e) => setValues((prev) => ({ ...prev, doctor: e.target.value }))}
                  className="bg-neutral-0 focus:border-primary-400 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none"
                >
                  {doctors.map((doctor) => (
                    <option key={doctor} value={doctor}>
                      {doctor}
                    </option>
                  ))}
                </select>
                {errors.doctor ? (
                  <p className="text-error-500 mt-1 text-xs">{errors.doctor}</p>
                ) : null}
              </label>
              {field('chiefComplaint', 'Chief Complaint', 'Enter the main reason for visit', true)}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {field('bloodPressure', 'Blood Pressure', 'e.g. 120/80')}
                {field('heartRate', 'Heart Rate', 'e.g. 72')}
                {field('temperature', 'Temperature', 'e.g. 98.6')}
                {field('spo2', 'SpO2', 'e.g. 98')}
              </div>
              {field('diagnosis', 'Diagnosis', 'Primary diagnosis', true)}
              {field(
                'treatmentPlan',
                'Treatment Plan',
                'Medication, follow-up, and recommendations',
                true
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="border-primary-100 bg-primary-50 text-primary-800 rounded-md border p-3 text-sm">
                Review all entries before submission. Encounter will be saved to patient history.
              </div>
              {field('prescriptions', 'Prescriptions', 'Example: Lisinopril 10mg once daily', true)}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-neutral-600 uppercase">
                  Follow-up Date
                </span>
                <input
                  type="date"
                  value={values.followUpDate}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      followUpDate: e.target.value,
                    }))
                  }
                  className="bg-neutral-0 focus:border-primary-400 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-700 outline-none"
                />
                {errors.followUpDate ? (
                  <p className="text-error-500 mt-1 text-xs">{errors.followUpDate}</p>
                ) : null}
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={previous}
            disabled={step === 0}
            className="bg-neutral-0 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="bg-primary-700 text-neutral-0 hover:bg-primary-800 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={submit}
              className="bg-primary-700 text-neutral-0 hover:bg-primary-800 rounded-lg px-4 py-2 text-sm font-medium"
            >
              Submit Encounter
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
