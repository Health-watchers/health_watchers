'use client';

import { useMemo, useState } from 'react';
import {
  REGISTRATION_STEPS,
  createInitialRegistrationState,
  type RegistrationState,
  type RegistrationStepId,
} from '@/lib/registration/types';
import { validateStep, type FieldError } from '@/lib/registration/validation';

const STEP_LABELS: Record<RegistrationStepId, string> = {
  identity: 'Identity',
  insurance: 'Insurance',
  emergencyContact: 'Emergency Contact',
  medicationHistory: 'Medications',
  allergies: 'Allergies',
  consent: 'Consent',
  review: 'Review',
};

/**
 * Step-by-step patient registration wizard with per-step validation,
 * a progress indicator, and support for OCR-assisted insurance card entry.
 */
export function RegistrationWizard({ onComplete }: { onComplete?: (state: RegistrationState) => void }) {
  const [state, setState] = useState<RegistrationState>(createInitialRegistrationState());
  const [errors, setErrors] = useState<FieldError[]>([]);

  const stepIndex = REGISTRATION_STEPS.indexOf(state.currentStep);
  const progressPct = useMemo(
    () => Math.round(((stepIndex + 1) / REGISTRATION_STEPS.length) * 100),
    [stepIndex]
  );

  function goToStep(step: RegistrationStepId) {
    setState((prev) => ({ ...prev, currentStep: step }));
    setErrors([]);
  }

  function handleNext() {
    const stepErrors = validateStep(state.currentStep, state);
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      return;
    }

    const nextIndex = stepIndex + 1;
    const completedSteps = Array.from(new Set([...state.completedSteps, state.currentStep]));

    if (nextIndex >= REGISTRATION_STEPS.length - 1 && state.currentStep === 'review') {
      onComplete?.({ ...state, completedSteps });
      return;
    }

    setState((prev) => ({
      ...prev,
      completedSteps,
      currentStep: REGISTRATION_STEPS[Math.min(nextIndex, REGISTRATION_STEPS.length - 1)],
    }));
    setErrors([]);
  }

  function handleBack() {
    const prevIndex = Math.max(stepIndex - 1, 0);
    goToStep(REGISTRATION_STEPS[prevIndex]);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <div>
        <div className="h-2 w-full rounded bg-gray-200">
          <div className="h-2 rounded bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Step {stepIndex + 1} of {REGISTRATION_STEPS.length} — {STEP_LABELS[state.currentStep]}
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errors.map((error, i) => (
            <li key={i}>{error.message}</li>
          ))}
        </ul>
      )}

      {state.currentStep === 'identity' && (
        <div className="space-y-2">
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="First name"
            value={state.identity.firstName}
            onChange={(e) =>
              setState((prev) => ({ ...prev, identity: { ...prev.identity, firstName: e.target.value } }))
            }
          />
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Last name"
            value={state.identity.lastName}
            onChange={(e) =>
              setState((prev) => ({ ...prev, identity: { ...prev.identity, lastName: e.target.value } }))
            }
          />
          <input
            type="date"
            className="w-full rounded border px-2 py-1"
            value={state.identity.dateOfBirth}
            onChange={(e) =>
              setState((prev) => ({ ...prev, identity: { ...prev.identity, dateOfBirth: e.target.value } }))
            }
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.identity.idVerified}
              onChange={() =>
                setState((prev) => ({
                  ...prev,
                  identity: { ...prev.identity, idVerified: !prev.identity.idVerified },
                }))
              }
            />
            ID verified
          </label>
        </div>
      )}

      {state.currentStep === 'insurance' && (
        <div className="space-y-2">
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Insurance provider"
            value={state.insurance.provider}
            onChange={(e) =>
              setState((prev) => ({ ...prev, insurance: { ...prev.insurance, provider: e.target.value } }))
            }
          />
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Member ID"
            value={state.insurance.memberId}
            onChange={(e) =>
              setState((prev) => ({ ...prev, insurance: { ...prev.insurance, memberId: e.target.value } }))
            }
          />
          <p className="text-xs text-gray-500">Card scanning (OCR) can pre-fill these fields.</p>
        </div>
      )}

      {state.currentStep === 'emergencyContact' && (
        <div className="space-y-2">
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Contact name"
            value={state.emergencyContact.name}
            onChange={(e) =>
              setState((prev) => ({ ...prev, emergencyContact: { ...prev.emergencyContact, name: e.target.value } }))
            }
          />
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Relationship"
            value={state.emergencyContact.relationship}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                emergencyContact: { ...prev.emergencyContact, relationship: e.target.value },
              }))
            }
          />
          <input
            className="w-full rounded border px-2 py-1"
            placeholder="Phone"
            value={state.emergencyContact.phone}
            onChange={(e) =>
              setState((prev) => ({ ...prev, emergencyContact: { ...prev.emergencyContact, phone: e.target.value } }))
            }
          />
        </div>
      )}

      {state.currentStep === 'medicationHistory' && (
        <div className="space-y-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() =>
              setState((prev) => ({ ...prev, medications: [...prev.medications, { name: '' }] }))
            }
          >
            Add medication
          </button>
          {state.medications.map((med, i) => (
            <input
              key={i}
              className="w-full rounded border px-2 py-1"
              placeholder="Medication name"
              value={med.name}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  medications: prev.medications.map((m, idx) => (idx === i ? { ...m, name: e.target.value } : m)),
                }))
              }
            />
          ))}
        </div>
      )}

      {state.currentStep === 'allergies' && (
        <div className="space-y-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            onClick={() =>
              setState((prev) => ({
                ...prev,
                allergies: [...prev.allergies, { substance: '', severity: 'mild' }],
              }))
            }
          >
            Add allergy
          </button>
          {state.allergies.map((allergy, i) => (
            <input
              key={i}
              className="w-full rounded border px-2 py-1"
              placeholder="Substance"
              value={allergy.substance}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  allergies: prev.allergies.map((a, idx) =>
                    idx === i ? { ...a, substance: e.target.value } : a
                  ),
                }))
              }
            />
          ))}
        </div>
      )}

      {state.currentStep === 'consent' && (
        <div className="space-y-2 text-sm">
          {(
            [
              ['treatmentConsent', 'I consent to treatment'],
              ['hipaaAcknowledged', 'I acknowledge the HIPAA notice'],
              ['financialResponsibility', 'I accept financial responsibility'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.consent[key]}
                onChange={() =>
                  setState((prev) => ({ ...prev, consent: { ...prev.consent, [key]: !prev.consent[key] } }))
                }
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {state.currentStep === 'review' && (
        <div className="space-y-1 text-sm">
          <p>
            <strong>Name:</strong> {state.identity.firstName} {state.identity.lastName}
          </p>
          <p>
            <strong>Insurance:</strong> {state.insurance.provider} ({state.insurance.memberId})
          </p>
          <p>
            <strong>Emergency contact:</strong> {state.emergencyContact.name}
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          onClick={handleBack}
          disabled={stepIndex === 0}
        >
          Back
        </button>
        <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm text-white" onClick={handleNext}>
          {state.currentStep === 'review' ? 'Complete registration' : 'Next'}
        </button>
      </div>
    </div>
  );
}
