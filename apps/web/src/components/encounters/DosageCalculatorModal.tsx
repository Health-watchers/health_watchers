'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { API_V1 } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DosageResult {
  recommendedDose: string;
  frequency: string;
  route: string;
  maxDailyDose: string;
  pediatricAdjustment: boolean;
  renalAdjustment: boolean;
  warnings: string[];
  contraindications: string[];
  disclaimer: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-filled drug name from the prescription row */
  initialDrugName?: string;
  /** Called when doctor confirms — passes dose + frequency to auto-fill */
  onApply: (dose: string, frequency: string, route: string) => void;
  /** Patient data for weight-based dosing */
  patientWeight?: number;
  patientAge?: number;
  patientSex?: 'M' | 'F';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DosageCalculatorModal({
  open,
  onClose,
  initialDrugName = '',
  onApply,
  patientWeight,
  patientAge,
  patientSex,
}: Props) {
  const [drugName, setDrugName] = useState(initialDrugName);
  const [weight, setWeight] = useState(patientWeight?.toString() ?? '');
  const [age, setAge] = useState(patientAge?.toString() ?? '');
  const [sex, setSex] = useState<'M' | 'F'>(patientSex ?? 'M');
  const [indication, setIndication] = useState('');
  const [renalFunction, setRenalFunction] = useState<string>('normal');
  const [hepaticFunction, setHepaticFunction] = useState<string>('normal');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DosageResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function calculate() {
    if (!drugName.trim() || !weight || !age || !indication.trim()) {
      setError('Drug name, weight, age, and indication are required.');
      return;
    }
    setError('');
    setResult(null);
    setConfirmed(false);
    setLoading(true);

    try {
      const res = await fetch(`${API_V1}/ai/dosage-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drugName: drugName.trim(),
          patientWeight: parseFloat(weight),
          patientAge: parseInt(age, 10),
          patientSex: sex,
          indication: indication.trim(),
          renalFunction: renalFunction !== 'normal' ? renalFunction : undefined,
          hepaticFunction: hepaticFunction !== 'normal' ? hepaticFunction : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `Error ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    onApply(result.recommendedDose, result.frequency, result.route);
    setConfirmed(true);
    setTimeout(onClose, 800);
  }

  function handleClose() {
    setResult(null);
    setError('');
    setConfirmed(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="AI Dosage Calculator"
      description="Enter patient parameters to calculate an evidence-based dose recommendation."
      size="lg"
    >
      <div className="space-y-4">
        {/* ── Input form ── */}
        {!result && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Drug Name *"
                  value={drugName}
                  onChange={(e) => setDrugName(e.target.value)}
                  placeholder="e.g. Amoxicillin"
                />
              </div>

              <Input
                label="Patient Weight (kg) *"
                type="number"
                min={0.5}
                max={500}
                step={0.1}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="e.g. 70"
              />

              <Input
                label="Patient Age (years) *"
                type="number"
                min={0}
                max={130}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 35"
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Sex *
                </label>
                <select
                  value={sex}
                  onChange={(e) => setSex(e.target.value as 'M' | 'F')}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Renal Function
                </label>
                <select
                  value={renalFunction}
                  onChange={(e) => setRenalFunction(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="normal">Normal</option>
                  <option value="mild_impairment">Mild Impairment</option>
                  <option value="moderate_impairment">Moderate Impairment</option>
                  <option value="severe_impairment">Severe Impairment</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Hepatic Function
                </label>
                <select
                  value={hepaticFunction}
                  onChange={(e) => setHepaticFunction(e.target.value)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="normal">Normal</option>
                  <option value="impaired">Impaired</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Indication *
                </label>
                <textarea
                  value={indication}
                  onChange={(e) => setIndication(e.target.value)}
                  placeholder="e.g. Community-acquired pneumonia"
                  rows={2}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={calculate} loading={loading} disabled={loading}>
                {loading ? 'Calculating…' : 'Calculate Dose'}
              </Button>
            </div>
          </>
        )}

        {/* ── Result ── */}
        {result && (
          <div className="space-y-4">
            {/* Dose summary */}
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-blue-900">Recommended Dosage</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium text-neutral-500 uppercase">Dose</dt>
                  <dd className="font-semibold text-neutral-900">{result.recommendedDose}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-neutral-500 uppercase">Frequency</dt>
                  <dd className="font-semibold text-neutral-900">{result.frequency}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-neutral-500 uppercase">Route</dt>
                  <dd className="font-semibold text-neutral-900">{result.route}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-neutral-500 uppercase">Max Daily Dose</dt>
                  <dd className="font-semibold text-neutral-900">{result.maxDailyDose}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-3 text-xs text-neutral-500">
                {result.pediatricAdjustment && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                    Pediatric adjustment applied
                  </span>
                )}
                {result.renalAdjustment && (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
                    Renal adjustment applied
                  </span>
                )}
              </div>
            </div>

            {/* Contraindications — red */}
            {result.contraindications.length > 0 && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-4"
              >
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-800">
                  <span aria-hidden="true">⛔</span> Contraindications
                </h3>
                <ul className="space-y-1">
                  {result.contraindications.map((c, i) => (
                    <li key={i} className="text-sm text-red-700">
                      • {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings — amber */}
            {result.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                  <span aria-hidden="true">⚠️</span> Warnings
                </h3>
                <ul className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i} className="text-sm text-amber-700">
                      • {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Disclaimer */}
            <p className="text-[11px] italic text-neutral-400">{result.disclaimer}</p>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setResult(null); setConfirmed(false); }}
              >
                ← Recalculate
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={confirmed}
                  className={confirmed ? 'bg-green-600 hover:bg-green-600' : ''}
                >
                  {confirmed ? '✓ Applied' : 'Apply to Prescription'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
