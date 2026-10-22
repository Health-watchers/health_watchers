'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
  onSubmit: (values: EncounterFormValues) => Promise<void> | void;
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

const schema = z.object({
  patientName: z.string().trim().min(1, 'Patient name is required'),
  patientMrn: z.string().trim().min(1, 'Patient MRN is required'),
  doctor: z.string().trim().min(1, 'Attending doctor is required'),
  chiefComplaint: z.string().trim().min(1, 'Chief complaint is required'),
  bloodPressure: z.string().trim().min(1, 'Blood pressure is required'),
  heartRate: z.string().trim().min(1, 'Heart rate is required'),
  temperature: z.string().trim().min(1, 'Temperature is required'),
  spo2: z.string().trim().min(1, 'SpO2 is required'),
  diagnosis: z.string().trim().min(1, 'Diagnosis is required'),
  treatmentPlan: z.string().trim().min(1, 'Treatment plan is required'),
  prescriptions: z.string().trim().min(1, 'Prescription details are required'),
  followUpDate: z.string().trim().min(1, 'Follow-up date is required'),
});

const STEPS = ['Initial Assessment', 'Clinical Data', 'Review & Sign'];
const STEP_FIELDS: Array<Array<keyof EncounterFormValues>> = [
  ['patientName', 'patientMrn', 'doctor', 'chiefComplaint'],
  ['bloodPressure', 'heartRate', 'temperature', 'spo2', 'diagnosis', 'treatmentPlan'],
  ['prescriptions', 'followUpDate'],
];

export default function EncounterForm({
  open,
  onClose,
  onSubmit,
  doctors = ['Dr. Julian Smith'],
}: EncounterFormProps) {
  const [step, setStep] = useState(0);
  const {
    register,
    handleSubmit,
    trigger,
    getFieldState,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<EncounterFormValues>({
    resolver: zodResolver(schema),
    defaultValues: INITIAL_VALUES,
    mode: 'onBlur',
  });
  const progress = ((step + 1) / STEPS.length) * 100;
  const currentStep = STEPS.find((_, index) => index === step) ?? 'Initial Assessment';

  if (!open) {
    return null;
  }

  const next = async () => {
    const fields = STEP_FIELDS.find((_, index) => index === step);
    if (fields && (await trigger(fields))) {
      clearErrors('root');
      setStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const previous = () => {
    clearErrors('root');
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const submit = async (values: EncounterFormValues) => {
    try {
      await onSubmit(values);
      reset(INITIAL_VALUES);
      clearErrors();
      setStep(0);
      onClose();
    } catch (error) {
      setError('root', {
        type: 'server',
        message: error instanceof Error ? error.message : 'Failed to save encounter',
      });
    }
  };

  const registerField = (key: keyof EncounterFormValues) => {
    switch (key) {
      case 'patientName':
        return register('patientName');
      case 'patientMrn':
        return register('patientMrn');
      case 'doctor':
        return register('doctor');
      case 'chiefComplaint':
        return register('chiefComplaint');
      case 'bloodPressure':
        return register('bloodPressure');
      case 'heartRate':
        return register('heartRate');
      case 'temperature':
        return register('temperature');
      case 'spo2':
        return register('spo2');
      case 'diagnosis':
        return register('diagnosis');
      case 'treatmentPlan':
        return register('treatmentPlan');
      case 'prescriptions':
        return register('prescriptions');
      case 'followUpDate':
        return register('followUpDate');
    }
  };

  const field = (
    key: keyof EncounterFormValues,
    label: string,
    placeholder: string,
    multiline?: boolean,
    type = 'text'
  ) => {
    const inputId = `encounter-${key}`;
    const errorMessage = getFieldState(key).error?.message;
    const registration = registerField(key);
    const describedBy = errorMessage ? `${inputId}-error` : undefined;
    const inputClass = `bg-neutral-0 focus:border-primary-400 w-full rounded-md border px-3 py-2 text-sm text-neutral-700 outline-none ${errorMessage ? 'border-error-500' : 'border-neutral-200'} ${multiline ? 'min-h-24' : ''}`;
    const requiredLabel = (
      <>
        {label}
        <span aria-hidden="true" className="text-error-500 ml-1">
          *
        </span>
        <span className="sr-only"> required</span>
      </>
    );

    return (
      <div className="block">
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-semibold tracking-wide text-neutral-600 uppercase"
        >
          {requiredLabel}
        </label>
        {multiline ? (
          <textarea
            id={inputId}
            {...registration}
            required
            aria-required="true"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            placeholder={placeholder}
            className={inputClass}
          />
        ) : (
          <input
            id={inputId}
            type={type}
            {...registration}
            required
            aria-required="true"
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            placeholder={placeholder}
            className={inputClass}
          />
        )}
        {errorMessage ? (
          <p id={`${inputId}-error`} role="alert" className="text-error-500 mt-1 text-xs">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close encounter form"
        disabled={isSubmitting}
        className="absolute inset-0 bg-black/30"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="encounter-form-title"
        className="absolute top-0 right-0 h-full w-full max-w-[560px] overflow-y-auto bg-neutral-50 p-5 shadow-2xl"
      >
        <form noValidate onSubmit={handleSubmit(submit)}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 id="encounter-form-title" className="text-2xl font-semibold text-neutral-900">
                Log Encounter
              </h2>
              <p className="text-sm text-neutral-500">
                Step {step + 1} of {STEPS.length}: {currentStep}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close encounter form"
              className="hover:bg-neutral-0 rounded-md p-2 text-neutral-500 disabled:opacity-50"
            >
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

          {errors.root?.message && (
            <div
              role="alert"
              aria-live="assertive"
              className="bg-danger-50 text-danger-700 mb-4 rounded-md px-3 py-2 text-sm"
            >
              {errors.root.message}
            </div>
          )}

          <div className="bg-neutral-0 space-y-4 rounded-lg p-4">
            {step === 0 ? (
              <>
                {field('patientName', 'Patient Name', 'Enter patient full name')}
                {field('patientMrn', 'Patient MRN', 'Enter medical record number')}
                <div className="block">
                  <label
                    htmlFor="encounter-doctor"
                    className="mb-1 block text-xs font-semibold tracking-wide text-neutral-600 uppercase"
                  >
                    Attending Doctor
                    <span aria-hidden="true" className="text-error-500 ml-1">
                      *
                    </span>
                    <span className="sr-only"> required</span>
                  </label>
                  <select
                    id="encounter-doctor"
                    {...register('doctor')}
                    required
                    aria-required="true"
                    aria-invalid={Boolean(errors.doctor)}
                    aria-describedby={errors.doctor ? 'encounter-doctor-error' : undefined}
                    className={`bg-neutral-0 focus:border-primary-400 w-full rounded-md border px-3 py-2 text-sm text-neutral-700 outline-none ${errors.doctor ? 'border-error-500' : 'border-neutral-200'}`}
                  >
                    {doctors.map((doctor) => (
                      <option key={doctor} value={doctor}>
                        {doctor}
                      </option>
                    ))}
                  </select>
                  {errors.doctor?.message && (
                    <p
                      id="encounter-doctor-error"
                      role="alert"
                      className="text-error-500 mt-1 text-xs"
                    >
                      {errors.doctor.message}
                    </p>
                  )}
                </div>
                {field(
                  'chiefComplaint',
                  'Chief Complaint',
                  'Enter the main reason for visit',
                  true
                )}
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
                {field(
                  'prescriptions',
                  'Prescriptions',
                  'Example: Lisinopril 10mg once daily',
                  true
                )}
                {field('followUpDate', 'Follow-up Date', '', false, 'date')}
              </>
            ) : null}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={previous}
              disabled={step === 0 || isSubmitting}
              className="bg-neutral-0 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => void next()}
                disabled={isSubmitting}
                className="bg-primary-700 text-neutral-0 hover:bg-primary-800 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary-700 text-neutral-0 hover:bg-primary-800 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Encounter'}
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}
