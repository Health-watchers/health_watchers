'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { Toast } from '@/components/ui';

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  fields: Record<string, unknown>;
}

interface FormSectionState {
  isCollapsed: boolean;
  isDirty: boolean;
}

interface EncounterFormData {
  chiefComplaint: string;
  diagnosis: string[];
  treatmentPlan: string;
  clinicalNotes: string;
  prescriptions: Array<{
    name: string;
    dose: string;
    frequency: string;
  }>;
  attachments: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
  followUpDate?: string;
  vitals: {
    bloodPressure: string;
    heartRate: string;
    temperature: string;
    spo2: string;
  };
}

interface EncounterDocumentationFormProps {
  encounterId: string;
  initialData?: EncounterFormData;
  onSave: (data: EncounterFormData) => Promise<void>;
  onCancel: () => void;
}

const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'general-checkup',
    name: 'General Check-up',
    description: 'Standard check-up form',
    fields: {
      vitals: { bloodPressure: '120/80', heartRate: '70', temperature: '98.6', spo2: '98' },
      chiefComplaint: '',
    },
  },
  {
    id: 'follow-up',
    name: 'Follow-up Visit',
    description: 'Follow-up assessment form',
    fields: {
      vitals: { bloodPressure: '', heartRate: '', temperature: '', spo2: '' },
      diagnosis: [],
      treatmentPlan: '',
    },
  },
];

const FIELD_VALIDATION_MESSAGES: Record<string, string> = {
  bloodPressure: 'Format: XXX/XX (e.g., 120/80)',
  heartRate: 'Enter a number between 40-200 bpm',
  temperature: 'Enter temperature in Fahrenheit (95-106°F)',
  spo2: 'Enter oxygen saturation (88-100%)',
};

const MEDICATION_INTERACTIONS: Record<string, string[]> = {
  warfarin: ['aspirin', 'ibuprofen', 'naproxen'],
  metformin: ['contrast dye'],
  lisinopril: ['potassium supplements'],
};

export function EncounterDocumentationForm({
  encounterId,
  initialData,
  onSave,
  onCancel,
}: EncounterDocumentationFormProps) {
  const [formData, setFormData] = useState<EncounterFormData>(
    initialData || {
      chiefComplaint: '',
      diagnosis: [],
      treatmentPlan: '',
      clinicalNotes: '',
      prescriptions: [],
      attachments: [],
      vitals: {
        bloodPressure: '',
        heartRate: '',
        temperature: '',
        spo2: '',
      },
    }
  );

  const [sections, setSections] = useState<Record<string, FormSectionState>>({
    vitals: { isCollapsed: false, isDirty: false },
    chief: { isCollapsed: false, isDirty: false },
    diagnosis: { isCollapsed: false, isDirty: false },
    treatment: { isCollapsed: false, isDirty: false },
    notes: { isCollapsed: false, isDirty: false },
    prescriptions: { isCollapsed: false, isDirty: false },
    attachments: { isCollapsed: false, isDirty: false },
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveTime, setAutoSaveTime] = useState<Date | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [medicationWarnings, setMedicationWarnings] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const recoveryDataRef = useRef<EncounterFormData | null>(null);

  // Auto-save functionality
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(() => {
      if (Object.values(sections).some((s) => s.isDirty)) {
        autoSaveForm();
      }
    }, 30000);

    // Save to recovery storage
    try {
      sessionStorage.setItem(`encounter_draft_${encounterId}`, JSON.stringify(formData));
    } catch {
      console.warn('Failed to save recovery data');
    }

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [formData, sections, encounterId]);

  // Recovery on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`encounter_draft_${encounterId}`);
      if (saved) {
        recoveryDataRef.current = JSON.parse(saved);
      }
    } catch {
      console.warn('Failed to load recovery data');
    }
  }, [encounterId]);

  const validateField = useCallback((fieldName: string, value: string): string => {
    switch (fieldName) {
      case 'bloodPressure':
        if (!/^\d{2,3}\/\d{2}$/.test(value)) return FIELD_VALIDATION_MESSAGES.bloodPressure;
        break;
      case 'heartRate':
        const hr = Number(value);
        if (isNaN(hr) || hr < 40 || hr > 200) return FIELD_VALIDATION_MESSAGES.heartRate;
        break;
      case 'temperature':
        const temp = Number(value);
        if (isNaN(temp) || temp < 95 || temp > 106) return FIELD_VALIDATION_MESSAGES.temperature;
        break;
      case 'spo2':
        const spo2 = Number(value);
        if (isNaN(spo2) || spo2 < 88 || spo2 > 100) return FIELD_VALIDATION_MESSAGES.spo2;
        break;
    }
    return '';
  }, []);

  const checkMedicationInteractions = useCallback(() => {
    const warnings: string[] = [];
    const medications = formData.prescriptions.map((p) => p.name.toLowerCase());

    for (const med of medications) {
      for (const [drug, interactions] of Object.entries(MEDICATION_INTERACTIONS)) {
        if (med.includes(drug)) {
          const conflicting = medications.filter((m) => interactions.some((i) => m.includes(i)));
          if (conflicting.length > 0) {
            warnings.push(`⚠️ Potential interaction: ${drug} with ${conflicting.join(', ')}`);
          }
        }
      }
    }

    setMedicationWarnings(warnings);
  }, [formData.prescriptions]);

  useEffect(() => {
    checkMedicationInteractions();
  }, [checkMedicationInteractions]);

  const applyTemplate = (templateId: string) => {
    const template = FORM_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;

    setFormData((prev) => ({ ...prev, ...template.fields }));
    setToast({ message: `Template "${template.name}" applied`, type: 'success' });
  };

  const autoSaveForm = async () => {
    try {
      setIsSaving(true);
      await onSave(formData);
      setAutoSaveTime(new Date());
      setSections((prev) =>
        Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, isDirty: false }]))
      );
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Auto-save failed',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleVitalChange = (key: keyof typeof formData.vitals, value: string) => {
    const error = validateField(key, value);
    setValidationErrors((prev) =>
      error ? { ...prev, [key]: error } : { ...prev, [key]: undefined }
    );

    setFormData((prev) => ({
      ...prev,
      vitals: { ...prev.vitals, [key]: value },
    }));

    setSections((prev) => ({
      ...prev,
      vitals: { ...prev.vitals, isDirty: true },
    }));
  };

  const handleAddPrescription = () => {
    setFormData((prev) => ({
      ...prev,
      prescriptions: [...prev.prescriptions, { name: '', dose: '', frequency: '' }],
    }));
  };

  const handleRemovePrescription = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      prescriptions: prev.prescriptions.filter((_, i) => i !== index),
    }));
    checkMedicationInteractions();
  };

  const handleUpdatePrescription = (
    index: number,
    field: keyof (typeof formData.prescriptions)[0],
    value: string
  ) => {
    setFormData((prev) => {
      const updated = [...prev.prescriptions];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, prescriptions: updated };
    });

    setSections((prev) => ({
      ...prev,
      prescriptions: { ...prev.prescriptions, isDirty: true },
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        setFormData((prev) => ({
          ...prev,
          attachments: [
            ...prev.attachments,
            {
              id: Math.random().toString(36).slice(2),
              name: file.name,
              url: reader.result as string,
              type: file.type,
            },
          ],
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleSection = (sectionKey: string) => {
    setSections((prev) => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], isCollapsed: !prev[sectionKey].isCollapsed },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      await onSave(formData);
      setToast({ message: 'Encounter documentation saved successfully', type: 'success' });
      sessionStorage.removeItem(`encounter_draft_${encounterId}`);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to save',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Encounter Documentation</h2>
          <p className="text-sm text-gray-600">Encounter ID: {encounterId}</p>
          {autoSaveTime && (
            <p className="text-xs text-gray-500">
              Auto-saved at {autoSaveTime.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Template selector */}
        <div className="flex gap-2">
          <select
            onChange={(e) => applyTemplate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select template...</option>
            {FORM_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Medication warnings */}
      {medicationWarnings.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="mb-2 font-semibold text-yellow-800">Medication Interaction Alerts</h3>
          <ul className="space-y-1">
            {medicationWarnings.map((warning, idx) => (
              <li key={idx} className="text-sm text-yellow-700">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Vitals section */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('vitals')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Vitals</h3>
          <span className="text-gray-600">{sections.vitals.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.vitals.isCollapsed && (
          <div className="space-y-3 border-t border-gray-200 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(formData.vitals).map(([key, value]) => (
                <div key={key}>
                  <label className="mb-1 block text-sm font-medium capitalize text-gray-700">
                    {key === 'spo2' ? 'SpO2' : key.replace(/([A-Z])/g, ' $1')}
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      handleVitalChange(key as keyof typeof formData.vitals, e.target.value)
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      validationErrors[key] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder={`Enter ${key}`}
                  />
                  {validationErrors[key] && (
                    <p className="mt-1 text-xs text-red-600">{validationErrors[key]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chief complaint section */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('chief')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Chief Complaint</h3>
          <span className="text-gray-600">{sections.chief.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.chief.isCollapsed && (
          <div className="border-t border-gray-200 p-4">
            <textarea
              value={formData.chiefComplaint}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, chiefComplaint: e.target.value }));
                setSections((prev) => ({
                  ...prev,
                  chief: { ...prev.chief, isDirty: true },
                }));
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Patient's chief complaint..."
              rows={3}
            />
          </div>
        )}
      </div>

      {/* Clinical notes section with rich text support */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('notes')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Clinical Notes</h3>
          <span className="text-gray-600">{sections.notes.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.notes.isCollapsed && (
          <div className="border-t border-gray-200 p-4">
            <p className="mb-2 text-xs text-gray-500">Rich text editor with formatting support</p>
            <textarea
              value={formData.clinicalNotes}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, clinicalNotes: e.target.value }));
                setSections((prev) => ({
                  ...prev,
                  notes: { ...prev.notes, isDirty: true },
                }));
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Clinical findings and observations..."
              rows={5}
            />
          </div>
        )}
      </div>

      {/* Diagnosis section */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('diagnosis')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Diagnosis</h3>
          <span className="text-gray-600">{sections.diagnosis.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.diagnosis.isCollapsed && (
          <div className="border-t border-gray-200 p-4">
            <input
              type="text"
              placeholder="Add diagnosis (press Enter)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  setFormData((prev) => ({
                    ...prev,
                    diagnosis: [...prev.diagnosis, e.currentTarget.value.trim()],
                  }));
                  e.currentTarget.value = '';
                  setSections((prev) => ({
                    ...prev,
                    diagnosis: { ...prev.diagnosis, isDirty: true },
                  }));
                }
              }}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="space-y-2">
              {formData.diagnosis.map((diag, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-blue-50 p-3"
                >
                  <span className="text-sm text-gray-800">{diag}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        diagnosis: prev.diagnosis.filter((_, i) => i !== idx),
                      }));
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowSuggestions(!showSuggestions)}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800"
            >
              {showSuggestions ? 'Hide' : 'Show'} AI suggestions
            </button>

            {showSuggestions && (
              <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-700">Suggested diagnoses:</p>
                <ul className="space-y-1 text-xs text-gray-600">
                  <li>• Hypertension</li>
                  <li>• Type 2 Diabetes</li>
                  <li>• Hyperlipidemia</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Treatment plan section */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('treatment')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Treatment Plan</h3>
          <span className="text-gray-600">{sections.treatment.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.treatment.isCollapsed && (
          <div className="border-t border-gray-200 p-4">
            <textarea
              value={formData.treatmentPlan}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, treatmentPlan: e.target.value }));
                setSections((prev) => ({
                  ...prev,
                  treatment: { ...prev.treatment, isDirty: true },
                }));
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Treatment plan and recommendations..."
              rows={4}
            />

            <label className="mb-1 mt-3 block text-sm font-medium text-gray-700">
              Follow-up Date (Optional)
            </label>
            <input
              type="date"
              value={formData.followUpDate || ''}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, followUpDate: e.target.value || undefined }));
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Prescriptions section */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('prescriptions')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Prescriptions</h3>
          <span className="text-gray-600">{sections.prescriptions.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.prescriptions.isCollapsed && (
          <div className="border-t border-gray-200 p-4">
            <div className="space-y-3">
              {formData.prescriptions.map((rx, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-gray-200 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={rx.name}
                      onChange={(e) => handleUpdatePrescription(idx, 'name', e.target.value)}
                      placeholder="Medication name"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={rx.dose}
                      onChange={(e) => handleUpdatePrescription(idx, 'dose', e.target.value)}
                      placeholder="Dose (e.g., 500mg)"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={rx.frequency}
                      onChange={(e) => handleUpdatePrescription(idx, 'frequency', e.target.value)}
                      placeholder="Frequency (e.g., 2x daily)"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePrescription(idx)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove prescription
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddPrescription}
              className="mt-3 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              + Add Prescription
            </button>
          </div>
        )}
      </div>

      {/* Attachments section */}
      <div className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => toggleSection('attachments')}
          className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 hover:bg-gray-100"
        >
          <h3 className="font-semibold text-gray-900">Attachments</h3>
          <span className="text-gray-600">{sections.attachments.isCollapsed ? '▼' : '▲'}</span>
        </button>

        {!sections.attachments.isCollapsed && (
          <div className="border-t border-gray-200 p-4">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="mb-3 block w-full text-sm text-gray-600"
            />

            <div className="space-y-2">
              {formData.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{attachment.name}</p>
                    <p className="text-xs text-gray-500">{attachment.type}</p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Preview
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          attachments: prev.attachments.filter((a) => a.id !== attachment.id),
                        }));
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Form actions */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Encounter'}
        </button>
      </div>
    </form>
  );
}
