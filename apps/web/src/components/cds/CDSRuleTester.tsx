'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CDSRule, CDSAlert } from '@/types/cds';

interface CDSRuleTesterProps {
  rule: CDSRule;
  onBack: () => void;
}

interface TestScenario {
  patientId: string;
  vitalSigns?: {
    bloodPressure?: string;
    heartRate?: number;
    temperature?: number;
    oxygenSaturation?: number;
  };
  prescription?: {
    drugName: string;
  };
}

async function evaluateRule(
  scenario: TestScenario & { trigger: string; clinicId: string }
): Promise<CDSAlert[]> {
  const res = await fetch('/api/cds/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
  });
  if (!res.ok) throw new Error('Failed to evaluate rule');
  const body = await res.json();
  return body.alerts || [];
}

export function CDSRuleTester({ rule, onBack }: CDSRuleTesterProps) {
  const [scenario, setScenario] = useState<TestScenario>({
    patientId: '',
    vitalSigns: {},
    prescription: { drugName: '' },
  });

  const [clinicId, setClinicId] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      evaluateRule({
        ...scenario,
        trigger: rule.trigger,
        clinicId,
      }),
  });

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenario.patientId || !clinicId) {
      alert('Please enter patient ID and clinic ID');
      return;
    }
    mutation.mutate();
  };

  const ruleMatches = mutation.data?.some((alert) => alert.ruleId === rule.ruleId);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-primary-600 hover:text-primary-700 text-sm">
        ← Back to Rules
      </button>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-neutral-900">Test Rule: {rule.name}</h2>

        <form onSubmit={handleTest} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Patient ID</label>
              <input
                type="text"
                value={scenario.patientId}
                onChange={(e) => setScenario({ ...scenario, patientId: e.target.value })}
                placeholder="Enter patient ID"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Clinic ID</label>
              <input
                type="text"
                value={clinicId}
                onChange={(e) => setClinicId(e.target.value)}
                placeholder="Enter clinic ID"
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {rule.trigger === 'vital_sign_record' && (
            <div className="space-y-3 rounded-md bg-neutral-50 p-4">
              <h3 className="font-medium text-neutral-900">Vital Signs</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700">
                    Blood Pressure
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 150/95"
                    onChange={(e) =>
                      setScenario({
                        ...scenario,
                        vitalSigns: { ...scenario.vitalSigns, bloodPressure: e.target.value },
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Heart Rate</label>
                  <input
                    type="number"
                    placeholder="e.g., 120"
                    onChange={(e) =>
                      setScenario({
                        ...scenario,
                        vitalSigns: { ...scenario.vitalSigns, heartRate: parseInt(e.target.value) },
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">Temperature</label>
                  <input
                    type="number"
                    placeholder="e.g., 39.5"
                    step="0.1"
                    onChange={(e) =>
                      setScenario({
                        ...scenario,
                        vitalSigns: {
                          ...scenario.vitalSigns,
                          temperature: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700">
                    O2 Saturation
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 88"
                    onChange={(e) =>
                      setScenario({
                        ...scenario,
                        vitalSigns: {
                          ...scenario.vitalSigns,
                          oxygenSaturation: parseInt(e.target.value),
                        },
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {(rule.trigger === 'prescription_add' ||
            rule.category === 'drug_interaction' ||
            rule.category === 'allergy') && (
            <div className="rounded-md bg-neutral-50 p-4">
              <label className="block text-sm font-medium text-neutral-700">Drug Name</label>
              <input
                type="text"
                placeholder="e.g., Aspirin"
                onChange={(e) =>
                  setScenario({
                    ...scenario,
                    prescription: { drugName: e.target.value },
                  })
                }
                className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Testing…' : 'Run Test'}
          </button>
        </form>

        {mutation.data && (
          <div className="mt-6 rounded-md border-l-4 border-blue-500 bg-blue-50 p-4">
            <h3 className="font-medium text-blue-900">Test Results</h3>
            {ruleMatches ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-blue-800">✓ Rule would fire for this scenario</p>
                {mutation.data
                  .filter((alert) => alert.ruleId === rule.ruleId)
                  .map((alert, idx) => (
                    <div key={idx} className="mt-2 rounded-md bg-white p-3 text-sm">
                      <p className="font-medium text-neutral-900">{alert.message}</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        Severity: <span className="font-medium">{alert.severity}</span> | Action:{' '}
                        <span className="font-medium">{alert.action}</span>
                      </p>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-blue-800">✗ Rule would not fire for this scenario</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
