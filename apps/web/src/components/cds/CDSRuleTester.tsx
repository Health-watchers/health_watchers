'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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

interface ScenarioPreset {
  id: string;
  label: string;
  description: string;
  scenario: TestScenario;
}

const SAMPLE_PATIENTS: ScenarioPreset[] = [
  {
    id: 'hypertensive',
    label: 'Hypertensive patient',
    description: 'BP 165/100, HR 88, Temp 36.8, SpO2 97',
    scenario: {
      patientId: 'sample-hypertensive',
      vitalSigns: {
        bloodPressure: '165/100',
        heartRate: 88,
        temperature: 36.8,
        oxygenSaturation: 97,
      },
    },
  },
  {
    id: 'diabetic',
    label: 'Diabetic patient',
    description: 'BP 138/86, HR 76, Temp 37.1, SpO2 98',
    scenario: {
      patientId: 'sample-diabetic',
      vitalSigns: {
        bloodPressure: '138/86',
        heartRate: 76,
        temperature: 37.1,
        oxygenSaturation: 98,
      },
    },
  },
  {
    id: 'drug-interaction',
    label: 'Drug interaction patient',
    description: 'Prescription scenario with Warfarin',
    scenario: {
      patientId: 'sample-drug-interaction',
      vitalSigns: {
        bloodPressure: '128/82',
        heartRate: 72,
        temperature: 36.6,
        oxygenSaturation: 99,
      },
      prescription: { drugName: 'Warfarin' },
    },
  },
  {
    id: 'sepsis',
    label: 'Suspected sepsis',
    description: 'BP 88/54, HR 124, Temp 39.6, SpO2 89',
    scenario: {
      patientId: 'sample-sepsis',
      vitalSigns: {
        bloodPressure: '88/54',
        heartRate: 124,
        temperature: 39.6,
        oxygenSaturation: 89,
      },
    },
  },
];

interface RuleVersion {
  version: number;
  changedAt: string;
  changedBy?: string;
  changeSummary?: string;
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

async function fetchRuleVersions(ruleId: string): Promise<RuleVersion[]> {
  const res = await fetch(`/api/cds/rules/${encodeURIComponent(ruleId)}/versions`);
  if (!res.ok) throw new Error('Failed to load rule versions');
  const body = await res.json();
  return body.versions || [];
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

  const versionsQuery = useQuery({
    queryKey: ['cds-rule-versions', rule.ruleId],
    queryFn: () => fetchRuleVersions(rule.ruleId),
  });

  const applyPreset = (preset: ScenarioPreset) => {
    setScenario({
      patientId: preset.scenario.patientId,
      vitalSigns: { ...preset.scenario.vitalSigns },
      prescription: preset.scenario.prescription
        ? { ...preset.scenario.prescription }
        : { drugName: '' },
    });
  };

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scenario.patientId || !clinicId) {
      alert('Please enter patient ID and clinic ID');
      return;
    }
    mutation.mutate();
  };

  const ruleMatches = mutation.data?.some((alert) => alert.ruleId === rule.ruleId);
  const otherAlerts = mutation.data?.filter((alert) => alert.ruleId !== rule.ruleId) ?? [];

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-primary-600 hover:text-primary-700">
        ← Back to Rules
      </button>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-neutral-900">Test Rule: {rule.name}</h2>

        <div className="mb-4 rounded-md bg-neutral-50 p-4">
          <h3 className="mb-2 font-medium text-neutral-900">Sample Patients</h3>
          <p className="mb-3 text-xs text-neutral-600">
            Load a fixture to prefill the scenario below.
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PATIENTS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                title={preset.description}
                className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

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
          <div
            className={`mt-6 rounded-md border-l-4 p-4 ${
              ruleMatches
                ? 'border-green-500 bg-green-50'
                : 'border-neutral-400 bg-neutral-50'
            }`}
          >
            <h3 className="font-medium text-neutral-900">Test Results</h3>
            <p
              className={`mt-2 text-sm font-medium ${
                ruleMatches ? 'text-green-800' : 'text-neutral-700'
              }`}
            >
              {ruleMatches
                ? '✓ PASS — rule would fire for this scenario'
                : '✗ FAIL — rule would not fire for this scenario'}
            </p>

            {ruleMatches && (
              <div className="mt-3 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  Matched rule
                </h4>
                {mutation.data
                  .filter((alert) => alert.ruleId === rule.ruleId)
                  .map((alert, idx) => (
                    <div key={idx} className="rounded-md bg-white p-3 text-sm">
                      <p className="font-medium text-neutral-900">{alert.message}</p>
                      <p className="mt-1 text-xs text-neutral-600">
                        Rule: <span className="font-medium">{rule.name}</span> ({alert.ruleId}) |
                        Severity: <span className="font-medium">{alert.severity}</span> | Action:{' '}
                        <span className="font-medium">{alert.action}</span>
                      </p>
                    </div>
                  ))}
              </div>
            )}

            {otherAlerts.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  ⚠ Other rules also fired ({otherAlerts.length}) — possible conflict
                </h4>
                {otherAlerts.map((alert, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
                  >
                    <p className="font-medium text-neutral-900">{alert.message}</p>
                    <p className="mt-1 text-xs text-neutral-600">
                      Rule: <span className="font-medium">{alert.ruleId}</span> | Severity:{' '}
                      <span className="font-medium">{alert.severity}</span> | Action:{' '}
                      <span className="font-medium">{alert.action}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Version History</h2>
        {versionsQuery.isLoading && (
          <p className="text-sm text-neutral-600">Loading version history…</p>
        )}
        {versionsQuery.isError && (
          <p className="text-sm text-red-600">Failed to load version history.</p>
        )}
        {versionsQuery.data && versionsQuery.data.length === 0 && (
          <p className="text-sm text-neutral-600">No prior versions recorded for this rule.</p>
        )}
        {versionsQuery.data && versionsQuery.data.length > 0 && (
          <ul className="divide-y divide-neutral-200">
            {versionsQuery.data.map((version) => (
              <li key={version.version} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">Version {version.version}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(version.changedAt).toLocaleString()}
                  </span>
                </div>
                {version.changedBy && (
                  <p className="mt-1 text-xs text-neutral-600">Changed by {version.changedBy}</p>
                )}
                {version.changeSummary && (
                  <p className="mt-1 text-xs text-neutral-600">{version.changeSummary}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
