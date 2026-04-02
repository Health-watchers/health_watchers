"use client";

import { useMemo, useState } from "react";

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
  patientName: "",
  patientMrn: "",
  doctor: "Dr. Julian Smith",
  chiefComplaint: "",
  bloodPressure: "",
  heartRate: "",
  temperature: "",
  spo2: "",
  diagnosis: "",
  treatmentPlan: "",
  prescriptions: "",
  followUpDate: "",
};

const STEPS = ["Initial Assessment", "Clinical Data", "Review & Sign"];

export default function EncounterForm({
  open,
  onClose,
  onSubmit,
  doctors = ["Dr. Julian Smith"],
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
      if (!values.patientName.trim())
        currentErrors.patientName = "Patient name is required";
      if (!values.patientMrn.trim())
        currentErrors.patientMrn = "Patient MRN is required";
      if (!values.doctor.trim())
        currentErrors.doctor = "Attending doctor is required";
      if (!values.chiefComplaint.trim())
        currentErrors.chiefComplaint = "Chief complaint is required";
    }

    if (stepIndex === 1) {
      if (!values.bloodPressure.trim())
        currentErrors.bloodPressure = "Blood pressure is required";
      if (!values.heartRate.trim())
        currentErrors.heartRate = "Heart rate is required";
      if (!values.temperature.trim())
        currentErrors.temperature = "Temperature is required";
      if (!values.spo2.trim()) currentErrors.spo2 = "SpO2 is required";
      if (!values.diagnosis.trim())
        currentErrors.diagnosis = "Diagnosis is required";
      if (!values.treatmentPlan.trim())
        currentErrors.treatmentPlan = "Treatment plan is required";
    }

    if (stepIndex === 2) {
      if (!values.prescriptions.trim())
        currentErrors.prescriptions = "Prescription details are required";
      if (!values.followUpDate.trim())
        currentErrors.followUpDate = "Follow-up date is required";
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
    multiline?: boolean,
  ) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={values[key]}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={placeholder}
          className="min-h-24 w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-400"
        />
      ) : (
        <input
          value={values[key]}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [key]: e.target.value }))
          }
          placeholder={placeholder}
          className="w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-400"
        />
      )}
      {errors[key] ? (
        <p className="mt-1 text-xs text-error-500">{errors[key]}</p>
      ) : null}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto bg-neutral-50 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900">
              Log Encounter
            </h2>
            <p className="text-sm text-neutral-500">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-neutral-500 hover:bg-neutral-0"
          >
            ✕
          </button>
        </div>

        <div className="mb-5 rounded-md bg-neutral-0 p-3">
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-primary-700 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="grid grid-cols-3 text-[11px] font-medium text-neutral-500">
            {STEPS.map((title, index) => (
              <span
                key={title}
                className={index <= step ? "text-primary-700" : ""}
              >
                {title}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-lg bg-neutral-0 p-4">
          {step === 0 ? (
            <>
              {field("patientName", "Patient Name", "Enter patient full name")}
              {field(
                "patientMrn",
                "Patient MRN",
                "Enter medical record number",
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Attending Doctor
                </span>
                <select
                  value={values.doctor}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, doctor: e.target.value }))
                  }
                  className="w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-400"
                >
                  {doctors.map((doctor) => (
                    <option key={doctor} value={doctor}>
                      {doctor}
                    </option>
                  ))}
                </select>
                {errors.doctor ? (
                  <p className="mt-1 text-xs text-error-500">{errors.doctor}</p>
                ) : null}
              </label>
              {field(
                "chiefComplaint",
                "Chief Complaint",
                "Enter the main reason for visit",
                true,
              )}
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("bloodPressure", "Blood Pressure", "e.g. 120/80")}
                {field("heartRate", "Heart Rate", "e.g. 72")}
                {field("temperature", "Temperature", "e.g. 98.6")}
                {field("spo2", "SpO2", "e.g. 98")}
              </div>
              {field("diagnosis", "Diagnosis", "Primary diagnosis", true)}
              {field(
                "treatmentPlan",
                "Treatment Plan",
                "Medication, follow-up, and recommendations",
                true,
              )}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="rounded-md border border-primary-100 bg-primary-50 p-3 text-sm text-primary-800">
                Review all entries before submission. Encounter will be saved to
                patient history.
              </div>
              {field(
                "prescriptions",
                "Prescriptions",
                "Example: Lisinopril 10mg once daily",
                true,
              )}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
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
                  className="w-full rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm text-neutral-700 outline-none focus:border-primary-400"
                />
                {errors.followUpDate ? (
                  <p className="mt-1 text-xs text-error-500">
                    {errors.followUpDate}
                  </p>
                ) : null}
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={previous}
            disabled={step === 0}
            className="rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-neutral-0 hover:bg-primary-800"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={submit}
              className="rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-neutral-0 hover:bg-primary-800"
            >
              Submit Encounter
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
